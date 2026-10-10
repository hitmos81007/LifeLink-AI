-- Repeatable synthetic directory and inventory for the public resource finder.
-- These records use reserved LL-DEMO-* codes, fictional labels, and no contact data.
-- They are not affiliated with real facilities and must never be used for care decisions.
BEGIN;

INSERT INTO public.hospitals (
  hospital_id,hospital_name,hospital_code,address,district,state,latitude,longitude,
  phone,email,hospital_type,trauma_center,status,verification_status,created_at,updated_at
)
VALUES
  ('a1000000-0000-4000-8000-000000000001','Demo Hospital 01','LL-DEMO-HOSP-01','Synthetic demo address 01','Demo Central District','Synthetic State',28.6139,77.2090,NULL,NULL,'Government',true,'Active','active',now(),now()),
  ('a1000000-0000-4000-8000-000000000002','Demo Hospital 02','LL-DEMO-HOSP-02','Synthetic demo address 02','Demo North District','Synthetic State',28.6335,77.2190,NULL,NULL,'Trust',true,'Active','active',now(),now()),
  ('a1000000-0000-4000-8000-000000000003','Demo Hospital 03','LL-DEMO-HOSP-03','Synthetic demo address 03','Demo East District','Synthetic State',28.6020,77.2340,NULL,NULL,'Private',false,'Active','active',now(),now()),
  ('a1000000-0000-4000-8000-000000000004','Demo Hospital 04','LL-DEMO-HOSP-04','Synthetic demo address 04','Demo West District','Synthetic State',28.6260,77.1850,NULL,NULL,'Government',false,'Active','active',now(),now()),
  ('a1000000-0000-4000-8000-000000000005','Demo Hospital 05','LL-DEMO-HOSP-05','Synthetic demo address 05','Demo South District','Synthetic State',28.5840,77.2130,NULL,NULL,'Trust',true,'Active','active',now(),now()),
  ('a1000000-0000-4000-8000-000000000006','Demo Hospital 06','LL-DEMO-HOSP-06','Synthetic demo address 06','Demo Rural District','Synthetic State',28.6690,77.2600,NULL,NULL,'Government',false,'Active','active',now(),now()),
  ('a1000000-0000-4000-8000-000000000007','Demo Hospital 07','LL-DEMO-HOSP-07','Synthetic demo address 07','Demo Suburban District','Synthetic State',28.5580,77.1780,NULL,NULL,'Private',true,'Active','active',now(),now()),
  ('a1000000-0000-4000-8000-000000000008','Demo Hospital 08','LL-DEMO-HOSP-08','Synthetic demo address 08','Demo Rural District','Synthetic State',28.6900,77.1500,NULL,NULL,'Government',false,'Active','active',now(),now())
ON CONFLICT (hospital_code) DO NOTHING;

INSERT INTO public.blood_banks (
  blood_bank_id,blood_bank_name,blood_bank_code,address,district,state,latitude,longitude,
  phone,email,status,verification_status,created_at,updated_at
)
VALUES
  ('a2000000-0000-4000-8000-000000000001','Demo Blood Bank 01','LL-DEMO-BANK-01','Synthetic demo address B1','Demo Central District','Synthetic State',28.6170,77.2050,NULL,NULL,'Active','active',now(),now()),
  ('a2000000-0000-4000-8000-000000000002','Demo Blood Bank 02','LL-DEMO-BANK-02','Synthetic demo address B2','Demo North District','Synthetic State',28.6420,77.2260,NULL,NULL,'Active','active',now(),now()),
  ('a2000000-0000-4000-8000-000000000003','Demo Blood Bank 03','LL-DEMO-BANK-03','Synthetic demo address B3','Demo South District','Synthetic State',28.5770,77.2200,NULL,NULL,'Active','active',now(),now())
ON CONFLICT (blood_bank_code) DO NOTHING;

INSERT INTO public.ambulance_providers (
  provider_id,provider_name,provider_code,district,state,phone,email,status,verification_status,created_at,updated_at
)
VALUES
  ('a3000000-0000-4000-8000-000000000001','Demo EMS Provider 01','LL-DEMO-EMS-01','Demo Central District','Synthetic State',NULL,NULL,'Active','active',now(),now()),
  ('a3000000-0000-4000-8000-000000000002','Demo EMS Provider 02','LL-DEMO-EMS-02','Demo Rural District','Synthetic State',NULL,NULL,'Active','active',now(),now())
ON CONFLICT (provider_code) DO NOTHING;

-- Seed one known inventory snapshot per synthetic hospital only. Existing rows are
-- left untouched so rerunning this migration never overwrites operator changes.
INSERT INTO public.icu_inventory (
  hospital_id,total_icu_beds,occupied_icu_beds,reserved_icu_beds,available_icu_beds,minimum_icu_beds,created_at,updated_at
)
SELECT h.hospital_id,v.total,v.occupied,v.reserved,v.total-v.occupied-v.reserved,v.minimum,now(),now()
FROM (VALUES
  ('LL-DEMO-HOSP-01',24,17,1,4),('LL-DEMO-HOSP-02',18,14,0,3),
  ('LL-DEMO-HOSP-03',12,8,1,2),('LL-DEMO-HOSP-04',8,6,0,2),
  ('LL-DEMO-HOSP-05',20,11,2,4),('LL-DEMO-HOSP-06',6,5,0,1),
  ('LL-DEMO-HOSP-07',16,9,1,3),('LL-DEMO-HOSP-08',5,4,0,1)
) AS v(code,total,occupied,reserved,minimum)
JOIN public.hospitals h ON h.hospital_code=v.code
WHERE NOT EXISTS (SELECT 1 FROM public.icu_inventory i WHERE i.hospital_id=h.hospital_id);

INSERT INTO public.general_bed_inventory (
  hospital_id,total_beds,occupied_beds,reserved_beds,available_beds,minimum_beds,created_at,updated_at
)
SELECT h.hospital_id,v.total,v.occupied,v.reserved,v.total-v.occupied-v.reserved,v.minimum,now(),now()
FROM (VALUES
  ('LL-DEMO-HOSP-01',220,146,8,35),('LL-DEMO-HOSP-02',160,118,5,24),
  ('LL-DEMO-HOSP-03',110,70,4,18),('LL-DEMO-HOSP-04',90,72,3,15),
  ('LL-DEMO-HOSP-05',180,104,6,28),('LL-DEMO-HOSP-06',45,37,1,8),
  ('LL-DEMO-HOSP-07',135,77,4,20),('LL-DEMO-HOSP-08',38,32,1,7)
) AS v(code,total,occupied,reserved,minimum)
JOIN public.hospitals h ON h.hospital_code=v.code
WHERE NOT EXISTS (SELECT 1 FROM public.general_bed_inventory i WHERE i.hospital_id=h.hospital_id);

INSERT INTO public.oxygen_inventory (
  hospital_id,oxygen_type,total_capacity,available_capacity,minimum_threshold,unit,created_at,updated_at
)
SELECT h.hospital_id,'Cylinder',v.total,v.available,v.minimum,'cylinders',now(),now()
FROM (VALUES
  ('LL-DEMO-HOSP-01',140,82,30),('LL-DEMO-HOSP-02',100,22,25),
  ('LL-DEMO-HOSP-03',80,51,18),('LL-DEMO-HOSP-04',60,14,16),
  ('LL-DEMO-HOSP-05',120,75,25),('LL-DEMO-HOSP-06',30,8,10),
  ('LL-DEMO-HOSP-07',90,57,20),('LL-DEMO-HOSP-08',24,5,8)
) AS v(code,total,available,minimum)
JOIN public.hospitals h ON h.hospital_code=v.code
WHERE NOT EXISTS (SELECT 1 FROM public.oxygen_inventory i WHERE i.hospital_id=h.hospital_id);

INSERT INTO public.medicine_inventory (
  hospital_id,medicine_name,category,dosage,manufacturer,current_stock,reserved_stock,minimum_stock,unit,expiry_date,created_at,updated_at
)
SELECT h.hospital_id,'Synthetic demo supply pack','Other','Demo only',NULL,v.stock,0,v.minimum,'packs',current_date+180,now(),now()
FROM (VALUES
  ('LL-DEMO-HOSP-01',80,20),('LL-DEMO-HOSP-02',14,18),('LL-DEMO-HOSP-03',55,15),('LL-DEMO-HOSP-04',9,12),
  ('LL-DEMO-HOSP-05',65,18),('LL-DEMO-HOSP-06',6,8),('LL-DEMO-HOSP-07',48,15),('LL-DEMO-HOSP-08',5,7)
) AS v(code,stock,minimum)
JOIN public.hospitals h ON h.hospital_code=v.code
WHERE NOT EXISTS (
  SELECT 1 FROM public.medicine_inventory i
  WHERE i.hospital_id=h.hospital_id AND i.medicine_name='Synthetic demo supply pack'
    AND i.dosage='Demo only' AND i.unit='packs'
);

INSERT INTO public.blood_inventory (
  blood_bank_id,blood_group,available_units,reserved_units,expired_units,minimum_threshold,last_restocked,created_at,updated_at
)
SELECT b.blood_bank_id,v.blood_group::public.blood_group,v.units,0,0,v.minimum,now(),now(),now()
FROM (VALUES
  ('LL-DEMO-BANK-01','A+',12,5),('LL-DEMO-BANK-01','A-',6,3),('LL-DEMO-BANK-01','B+',10,4),('LL-DEMO-BANK-01','B-',5,2),('LL-DEMO-BANK-01','AB+',7,3),('LL-DEMO-BANK-01','AB-',3,2),('LL-DEMO-BANK-01','O+',15,6),('LL-DEMO-BANK-01','O-',4,5),
  ('LL-DEMO-BANK-02','A+',8,5),('LL-DEMO-BANK-02','A-',4,3),('LL-DEMO-BANK-02','B+',9,4),('LL-DEMO-BANK-02','B-',3,2),('LL-DEMO-BANK-02','AB+',5,3),('LL-DEMO-BANK-02','AB-',2,2),('LL-DEMO-BANK-02','O+',12,6),('LL-DEMO-BANK-02','O-',7,5),
  ('LL-DEMO-BANK-03','A+',10,5),('LL-DEMO-BANK-03','A-',3,3),('LL-DEMO-BANK-03','B+',7,4),('LL-DEMO-BANK-03','B-',4,2),('LL-DEMO-BANK-03','AB+',4,3),('LL-DEMO-BANK-03','AB-',2,2),('LL-DEMO-BANK-03','O+',13,6),('LL-DEMO-BANK-03','O-',5,5)
) AS v(code,blood_group,units,minimum)
JOIN public.blood_banks b ON b.blood_bank_code=v.code
WHERE NOT EXISTS (
  SELECT 1 FROM public.blood_inventory i WHERE i.blood_bank_id=b.blood_bank_id AND i.blood_group::text=v.blood_group
);

INSERT INTO public.ambulances (
  ambulance_id,provider_id,vehicle_number,ambulance_type,driver_name,driver_phone,current_latitude,current_longitude,status,assigned_hospital,created_at,updated_at
)
SELECT v.ambulance_id,p.provider_id,v.vehicle_number,v.ambulance_type::public.ambulance_type,'Synthetic demo crew',NULL,v.latitude,v.longitude,'Available',NULL,now(),now()
FROM (VALUES
  ('a4000000-0000-4000-8000-000000000001','LL-DEMO-EMS-01','LL-DEMO-UNIT-01','ALS',28.6150,77.2070),
  ('a4000000-0000-4000-8000-000000000002','LL-DEMO-EMS-01','LL-DEMO-UNIT-02','BLS',28.6200,77.2140),
  ('a4000000-0000-4000-8000-000000000003','LL-DEMO-EMS-02','LL-DEMO-UNIT-03','ICU',28.6750,77.2550),
  ('a4000000-0000-4000-8000-000000000004','LL-DEMO-EMS-02','LL-DEMO-UNIT-04','BLS',28.6860,77.1550)
) AS v(ambulance_id,provider_code,vehicle_number,ambulance_type,latitude,longitude)
JOIN public.ambulance_providers p ON p.provider_code=v.provider_code
WHERE NOT EXISTS (SELECT 1 FROM public.ambulances a WHERE a.vehicle_number=v.vehicle_number)
ON CONFLICT (ambulance_id) DO NOTHING;

COMMIT;
