/**
 * Reads the optional planning CSVs in the browser and returns aggregate-only
 * summaries. Raw rows (including names, IDs, diagnoses, and vital signs) are
 * never returned, persisted, or sent to Supabase.
 */
export type ScenarioShift = 'Morning' | 'Evening' | 'Night' | '24h On-Call';

export interface PatientDatasetSummary {
  rowCount: number;
  syntheticData: boolean;
  firstDate: string;
  lastDate: string;
  distinctDays: number;
  meanDailyArrivals: number;
  emergencyVisitsPerDay: number;
  emergencySurgicalCasesPerDay: number;
  electiveSurgicalCasesPerDay: number;
  inpatientAdmissionsPerDay: number;
  criticalOrSeverePerDay: number;
  estimatedOccupiedBeds: number;
  topCategories: Array<{ label: string; count: number }>;
  dateKeys: string[];
}

export interface StaffDatasetSummary {
  rowCount: number;
  syntheticData: boolean;
  firstDate: string;
  lastDate: string;
  distinctDays: number;
  shifts: Array<{
    shift: ScenarioShift;
    records: number;
    onDutyRate: number;
    punctualRate: number;
    averageOvertimeMinutes: number;
    averageSuccessRatio: number | null;
  }>;
  dateKeys: string[];
}

export interface ScenarioDatasetSummary {
  patients: PatientDatasetSummary;
  staff: StaffDatasetSummary;
  overlappingDays: number;
  syntheticData: boolean;
  dateCoverageNote: string;
  planningDefaults: { emergencyDemand: number; electiveDemand: number; staffAvailabilityFactor: number };
}

function* csvRows(text: string): Generator<string[]> {
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(cell); cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell); cell = '';
      if (row.some((item) => item.trim())) yield row;
      row = [];
    } else cell += char;
  }
  if (cell.length || row.length) { row.push(cell); if (row.some((item) => item.trim())) yield row; }
}

function scanCsv(text: string, required: string[], visit: (get: (column: string) => string) => void): string[] {
  const rows = csvRows(text);
  const first = rows.next();
  if (first.done) throw new Error('The CSV has no data rows.');
  const headers = first.value.map((header) => header.trim().replace(/^\uFEFF/, ''));
  const available = new Set(headers);
  const missing = required.filter((key) => !available.has(key));
  if (missing.length) throw new Error(`This does not look like the expected dataset; missing: ${missing.join(', ')}.`);
  const indexes = new Map<string, number>(headers.map((header, index) => [header, index] as [string, number]));
  let dataRows = 0;
  for (const values of rows) {
    dataRows += 1;
    visit((column) => values[indexes.get(column) ?? -1]?.trim() || '');
  }
  if (!dataRows) throw new Error('The CSV has no data rows.');
  return headers;
}

function toDate(value: string, format: 'iso' | 'dmy'): string | null {
  const match = format === 'iso' ? /^(\d{4})-(\d{2})-(\d{2})$/ : /^(\d{2})-(\d{2})-(\d{4})$/;
  const parts = value.match(match);
  if (!parts) return null;
  const [year, month, day] = format === 'iso'
    ? [Number(parts[1]), Number(parts[2]), Number(parts[3])]
    : [Number(parts[3]), Number(parts[2]), Number(parts[1])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? date.toISOString().slice(0, 10) : null;
}

const num = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export function summarizePatientDataset(text: string): PatientDatasetSummary {
  const header = text.slice(0, text.indexOf('\n') < 0 ? undefined : text.indexOf('\n')).replace(/^\uFEFF/, '');
  const isHourlyFlow = header.includes('date_local') && header.includes('observed_arrivals');
  const days = new Set<string>();
  const categoryCounts = new Map<string, number>();
  let rows = 0; let syntheticRows = 0; let arrivals = 0; let emergency = 0; let emergencySurgical = 0; let electiveSurgical = 0; let inpatient = 0; let severeCritical = 0; let occupiedBedDays = 0;
  const required = isHourlyFlow
    ? ['date_local','demand_category','department','observed_arrivals','emergency_visits','admissions','icu_admissions','planned_or_cases','general_bed_hours_demand','icu_bed_hours_demand']
    : ['Date_Of_Arrival','Admission_Type','Severity_Grade','Disease_Clinical_Category','Assigned_Hospital_Department','Length_Of_Stay_Days'];
  scanCsv(text, required, (get) => {
    rows += 1;
    if (/^(1|true|yes)$/i.test(get('synthetic_record'))) syntheticRows += 1;
    const date = toDate(get(isHourlyFlow ? 'date_local' : 'Date_Of_Arrival'), 'iso');
    if (date) days.add(date);
    const admission = get('Admission_Type').toLowerCase();
    const department = get(isHourlyFlow ? 'department' : 'Assigned_Hospital_Department').toLowerCase();
    const severity = get(isHourlyFlow ? 'highest_scenario_severity' : 'Severity_Grade').toLowerCase();
    if (isHourlyFlow) {
      const arrivalCount = num(get('observed_arrivals'));
      const emergencyCount = num(get('emergency_visits'));
      const category = get('demand_category').toLowerCase();
      arrivals += arrivalCount; emergency += emergencyCount;
      if (department.includes('surger') || /trauma|accident|injur|mass.casualty/.test(category)) emergencySurgical += emergencyCount;
      electiveSurgical += num(get('planned_or_cases'));
      inpatient += num(get('admissions'));
      occupiedBedDays += (num(get('general_bed_hours_demand')) + num(get('icu_bed_hours_demand'))) / 24;
      severeCritical += num(get('icu_admissions'));
      if (severity.includes('critical') || severity.includes('severe')) severeCritical += arrivalCount;
    } else {
      const los = Math.max(0, num(get('Length_Of_Stay_Days')));
      if (admission.includes('emergency') || admission.includes('urgent')) {
        emergency += 1;
        if (department.includes('surger')) emergencySurgical += 1;
      }
      if (admission.includes('elective') && department.includes('surger')) electiveSurgical += 1;
      if (los > 0) { inpatient += 1; occupiedBedDays += los; }
      if (severity.includes('critical') || severity.includes('severe')) severeCritical += 1;
    }
    const category = get(isHourlyFlow ? 'demand_category' : 'Disease_Clinical_Category') || 'Unclassified';
    categoryCounts.set(category, (categoryCounts.get(category) || 0) + (isHourlyFlow ? num(get('observed_arrivals')) : 1));
  });
  const sortedDays = [...days].sort();
  const denominator = Math.max(1, days.size);
  return {
    rowCount: rows, syntheticData: rows > 0 && syntheticRows / rows >= 0.99, firstDate: sortedDays[0] || '', lastDate: sortedDays[sortedDays.length - 1] || '', distinctDays: days.size,
    meanDailyArrivals: isHourlyFlow ? arrivals / denominator : rows / denominator, emergencyVisitsPerDay: emergency / denominator,
    emergencySurgicalCasesPerDay: emergencySurgical / denominator,
    electiveSurgicalCasesPerDay: electiveSurgical / denominator, inpatientAdmissionsPerDay: inpatient / denominator,
    criticalOrSeverePerDay: severeCritical / denominator, estimatedOccupiedBeds: occupiedBedDays / denominator,
    topCategories: [...categoryCounts].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, 6),
    dateKeys: sortedDays,
  };
}

export function summarizeStaffDataset(text: string): StaffDatasetSummary {
  const days = new Set<string>();
  const groups = new Map<ScenarioShift, { records: number; onDuty: number; punctual: number; overtime: number; successSum: number; successCount: number }>();
  let rows = 0; let syntheticRows = 0;
  const header = text.slice(0, text.indexOf('\n') < 0 ? undefined : text.indexOf('\n')).replace(/^\uFEFF/, '');
  const isShiftOperations = header.includes('date_local') && header.includes('planned_minutes');
  const required = isShiftOperations
    ? ['date_local','shift','planned_minutes','actual_worked_minutes','attendance_status','late_minutes','overtime_minutes','task_completion_pct']
    : ['Date','Shift_Type','Scheduled_Hours','Actual_Hours_Worked','Punctuality_Evaluation','Attendance_Status','Overtime_Min','Daily_Success_Ratio'];
  scanCsv(text, required, (get) => {
    rows += 1;
    if (/^(1|true|yes)$/i.test(get('synthetic_record'))) syntheticRows += 1;
    const date = toDate(get(isShiftOperations ? 'date_local' : 'Date'), isShiftOperations ? 'iso' : 'dmy');
    if (date) days.add(date);
    const rawShift = get(isShiftOperations ? 'shift' : 'Shift_Type');
    const normalizedShift = rawShift.toLowerCase().replace(/[_-]/g, ' ');
    const shift = normalizedShift === 'morning' ? 'Morning' : normalizedShift === 'evening' ? 'Evening'
      : normalizedShift === 'night' ? 'Night' : normalizedShift === '24h on call' || normalizedShift === 'on call' ? '24h On-Call' : null;
    if (!shift) return;
    const current = groups.get(shift) || { records: 0, onDuty: 0, punctual: 0, overtime: 0, successSum: 0, successCount: 0 };
    const attendance = get(isShiftOperations ? 'attendance_status' : 'Attendance_Status').toLowerCase();
    const late = isShiftOperations ? num(get('late_minutes')) : (/punctual|early/i.test(get('Punctuality_Evaluation')) ? 0 : 1);
    const successValue = isShiftOperations ? num(get('task_completion_pct')) / 100 : num(get('Daily_Success_Ratio'));
    current.records += 1;
    if (/present|on duty/i.test(attendance)) current.onDuty += 1;
    if (late <= 0) current.punctual += 1;
    current.overtime += Math.max(0, num(get(isShiftOperations ? 'overtime_minutes' : 'Overtime_Min')));
    if (successValue > 0) { current.successSum += successValue; current.successCount += 1; }
    groups.set(shift, current);
  });
  const sortedDays = [...days].sort();
  const shifts = [...groups.entries()].map(([shift, group]) => {
    return {
      shift, records: group.records, onDutyRate: group.records ? group.onDuty / group.records : 0,
      punctualRate: group.records ? group.punctual / group.records : 0,
      averageOvertimeMinutes: group.overtime / Math.max(1, group.records),
      averageSuccessRatio: group.successCount ? group.successSum / group.successCount : null,
    };
  });
  return { rowCount: rows, syntheticData: rows > 0 && syntheticRows / rows >= 0.99, firstDate: sortedDays[0] || '', lastDate: sortedDays[sortedDays.length - 1] || '', distinctDays: days.size, shifts, dateKeys: sortedDays };
}

export function combineScenarioSummaries(patients: PatientDatasetSummary, staff: StaffDatasetSummary, selectedShift: ScenarioShift): ScenarioDatasetSummary {
  const patientDates = new Set(patients.dateKeys);
  const overlap = new Set(staff.dateKeys.filter((date) => patientDates.has(date)));
  const shift = staff.shifts.find((item) => item.shift === selectedShift);
  const availability = shift?.onDutyRate ?? 1;
  const dateCoverageNote = patients.distinctDays >= 365
    ? 'Patient dataset covers at least one calendar year.'
    : `Patient history covers ${patients.distinctDays} distinct days, not a full year; forecasts are limited by this coverage.`;
  return {
    patients, staff, overlappingDays: overlap.size, syntheticData: patients.syntheticData || staff.syntheticData, dateCoverageNote,
    planningDefaults: {
      emergencyDemand: Math.ceil(patients.emergencySurgicalCasesPerDay),
      electiveDemand: Math.ceil(patients.electiveSurgicalCasesPerDay),
      staffAvailabilityFactor: availability,
    },
  };
}
