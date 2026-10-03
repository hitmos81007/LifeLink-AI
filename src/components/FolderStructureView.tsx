import React, { useState } from 'react';
import { FOLDER_TREE_DATA } from '../data/folderStructureData';
import { FolderNode } from '../types/architecture';
import { 
  Folder, 
  FolderOpen, 
  FileCode, 
  FileText, 
  ChevronRight, 
  ChevronDown, 
  Search, 
  Layers, 
  Tag, 
  Server, 
  Database, 
  Monitor, 
  Shield 
} from 'lucide-react';

export const FolderStructureView: React.FC = () => {
  const [selectedNode, setSelectedNode] = useState<FolderNode>(FOLDER_TREE_DATA.children![0].children![0]);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(
    new Set(['/', '/apps', '/apps/web', '/apps/web/src', '/services', '/services/api-gateway', '/services/ai-orchestrator', '/infra'])
  );
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');

  const toggleExpand = (path: string) => {
    const next = new Set(expandedPaths);
    if (next.has(path)) {
      next.delete(path);
    } else {
      next.add(path);
    }
    setExpandedPaths(next);
  };

  const getCategoryBadge = (category: string) => {
    switch (category) {
      case 'frontend':
        return <span className="px-2 py-0.5 text-[10px] mono font-semibold rounded bg-blue-50 text-blue-700 border border-blue-200">Frontend</span>;
      case 'backend':
        return <span className="px-2 py-0.5 text-[10px] mono font-semibold rounded bg-emerald-50 text-emerald-700 border border-emerald-200">FastAPI</span>;
      case 'database':
        return <span className="px-2 py-0.5 text-[10px] mono font-semibold rounded bg-amber-50 text-amber-700 border border-amber-200">Firestore</span>;
      case 'infra':
        return <span className="px-2 py-0.5 text-[10px] mono font-semibold rounded bg-purple-50 text-purple-700 border border-purple-200">Infra/Docker</span>;
      default:
        return <span className="px-2 py-0.5 text-[10px] mono font-semibold rounded bg-slate-100 text-slate-600 border border-slate-200">Shared</span>;
    }
  };

  const renderTree = (node: FolderNode, level: number = 0) => {
    if (categoryFilter !== 'ALL' && node.category !== categoryFilter && node.type === 'file') {
      return null;
    }

    const isFolder = node.type === 'folder';
    const isExpanded = expandedPaths.has(node.path);
    const isSelected = selectedNode.path === node.path;

    return (
      <div key={node.path} className="select-none">
        <div
          onClick={() => {
            if (isFolder) toggleExpand(node.path);
            setSelectedNode(node);
          }}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
          className={`flex items-center space-x-2 py-1 pr-2 rounded text-xs cursor-pointer transition-colors ${
            isSelected
              ? 'bg-blue-50 text-blue-900 font-semibold border border-blue-200'
              : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          {isFolder ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(node.path);
              }}
              className="p-0.5 rounded hover:bg-slate-200 text-slate-500"
            >
              {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-blue-600" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
            </button>
          ) : (
            <span className="w-3.5 h-3.5 inline-block" />
          )}

          {isFolder ? (
            isExpanded ? <FolderOpen className="w-4 h-4 text-blue-600" /> : <Folder className="w-4 h-4 text-blue-600" />
          ) : (
            <FileCode className="w-4 h-4 text-emerald-600" />
          )}

          <span className="mono text-[11px] truncate flex-1">{node.name}</span>
          <div className="shrink-0">{getCategoryBadge(node.category)}</div>
        </div>

        {isFolder && isExpanded && node.children && (
          <div>
            {node.children.map((child) => renderTree(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
      {/* Folder Tree Explorer */}
      <div className="lg:col-span-6 bg-white border border-slate-200 rounded-lg p-4 shadow-sm space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
          <h2 className="text-xs font-bold uppercase tracking-tight text-slate-800 flex items-center gap-2">
            <Layers className="w-4 h-4 text-blue-600" />
            Monorepo Directory Explorer
          </h2>
          <span className="text-[10px] mono text-slate-500">Clean Architecture</span>
        </div>

        {/* Category Filter Pills */}
        <div className="flex flex-wrap gap-1 border-b border-slate-100 pb-2.5">
          {['ALL', 'frontend', 'backend', 'database', 'infra'].map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-2.5 py-1 text-[10px] mono rounded transition-colors ${
                categoryFilter === cat
                  ? 'bg-blue-600 text-white font-bold'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200'
              }`}
            >
              {cat.toUpperCase()}
            </button>
          ))}
        </div>

        {/* Directory Tree */}
        <div className="space-y-0.5 max-h-[580px] overflow-y-auto pr-1">
          {renderTree(FOLDER_TREE_DATA)}
        </div>
      </div>

      {/* Selected File Details */}
      <div className="lg:col-span-6 space-y-4">
        <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-3">
            <div className="flex items-center space-x-2">
              {selectedNode.type === 'folder' ? (
                <FolderOpen className="w-5 h-5 text-blue-600" />
              ) : (
                <FileCode className="w-5 h-5 text-emerald-600" />
              )}
              <h3 className="text-xs font-bold mono text-slate-900">
                {selectedNode.path}
              </h3>
            </div>
            {getCategoryBadge(selectedNode.category)}
          </div>

          <p className="text-xs text-slate-600 leading-relaxed mb-4">
            {selectedNode.description}
          </p>

          <div className="bg-slate-50 rounded-lg p-3.5 border border-slate-200">
            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 mono">
              Architecture Layer Mapping
            </h4>
            <div className="space-y-1.5 text-xs text-slate-800">
              <div className="flex items-center justify-between bg-white p-2 rounded border border-slate-200">
                <span className="text-slate-500">Node Type:</span>
                <span className="mono text-blue-700 font-semibold capitalize">{selectedNode.type}</span>
              </div>
              <div className="flex items-center justify-between bg-white p-2 rounded border border-slate-200">
                <span className="text-slate-500">Domain Scope:</span>
                <span className="mono text-emerald-700 font-semibold">{selectedNode.category.toUpperCase()}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-[#0F172A] border border-slate-800 rounded-lg p-4 text-xs text-slate-300 space-y-1.5 shadow-md">
          <h4 className="font-bold text-white flex items-center gap-2">
            <Shield className="w-4 h-4 text-purple-400" />
            Monorepo Security & Deployment Policy
          </h4>
          <p className="text-slate-400 leading-relaxed text-[11px]">
            Each folder boundary corresponds to a strict IAM security role in Cloud Run and Firestore. Applications under <code className="text-blue-400 mono">/apps/web</code> are built into static SPA bundles served via Cloud Run Nginx proxies, while <code className="text-emerald-400 mono">/services/api-gateway</code> handles authenticated API traffic.
          </p>
        </div>
      </div>
    </div>
  );
};
