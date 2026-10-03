import { COMPONENT_TREE_DATA } from '../data/componentTreeData';
import { ComponentNode } from '../types/architecture';
import React, { useState } from 'react';
import { 
  Layers, 
  ChevronRight, 
  ChevronDown, 
  Box, 
  Code2, 
  Cpu, 
  Sparkles 
} from 'lucide-react';

export const ComponentHierarchyView: React.FC = () => {
  const [selectedNode, setSelectedNode] = useState<ComponentNode>(COMPONENT_TREE_DATA);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(
    new Set(['root-app', 'main-container', 'doc-view', 'ai-view'])
  );

  const toggleExpand = (id: string) => {
    const next = new Set(expandedNodes);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedNodes(next);
  };

  const getLayerBadge = (layer: string) => {
    switch (layer) {
      case 'Layout':
        return <span className="px-2 py-0.5 text-[10px] mono font-semibold rounded bg-purple-50 text-purple-700 border border-purple-200">Layout</span>;
      case 'Page':
        return <span className="px-2 py-0.5 text-[10px] mono font-semibold rounded bg-blue-50 text-blue-700 border border-blue-200">Page View</span>;
      case 'Feature':
        return <span className="px-2 py-0.5 text-[10px] mono font-semibold rounded bg-emerald-50 text-emerald-700 border border-emerald-200">Feature</span>;
      default:
        return <span className="px-2 py-0.5 text-[10px] mono font-semibold rounded bg-slate-100 text-slate-600 border border-slate-200">UI Component</span>;
    }
  };

  const renderTreeNode = (node: ComponentNode, level: number = 0) => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedNodes.has(node.id);
    const isSelected = selectedNode.id === node.id;

    return (
      <div key={node.id} className="select-none">
        <div
          onClick={() => {
            if (hasChildren) toggleExpand(node.id);
            setSelectedNode(node);
          }}
          style={{ paddingLeft: `${level * 16 + 8}px` }}
          className={`flex items-center space-x-2 py-1.5 pr-2 rounded text-xs cursor-pointer transition-colors ${
            isSelected
              ? 'bg-blue-50 text-blue-900 font-bold border border-blue-200'
              : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          {hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(node.id);
              }}
              className="p-0.5 text-slate-500 hover:bg-slate-200 rounded"
            >
              {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-blue-600" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
            </button>
          ) : (
            <span className="w-3.5 h-3.5 inline-block" />
          )}

          <Box className="w-3.5 h-3.5 text-blue-600 shrink-0" />
          <span className="mono text-xs truncate flex-1">{node.name}</span>
          {getLayerBadge(node.layer)}
        </div>

        {hasChildren && isExpanded && (
          <div>
            {node.children!.map(child => renderTreeNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 space-y-4">
      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded bg-blue-50 text-blue-700 border border-blue-200">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-tight">Frontend Component Hierarchy & State Mapping</h2>
            <p className="text-xs text-slate-500">React 19 Tree Architecture, Custom State Hooks, and Prop Flow</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Component Tree View */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-lg p-4 shadow-xs space-y-3">
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-tight mono">
            React Component Taxonomy Tree
          </h3>
          <div className="space-y-0.5 max-h-[550px] overflow-y-auto pr-1">
            {renderTreeNode(COMPONENT_TREE_DATA)}
          </div>
        </div>

        {/* Selected Component Inspector */}
        <div className="lg:col-span-6 space-y-4">
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-xs space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <div>
                <span className="text-[10px] mono text-slate-500 uppercase">Selected Node</span>
                <h3 className="text-sm font-bold mono text-slate-900 flex items-center gap-1.5">
                  <Box className="w-4 h-4 text-blue-600" />
                  &lt;{selectedNode.name} /&gt;
                </h3>
              </div>
              {getLayerBadge(selectedNode.layer)}
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              {selectedNode.description}
            </p>

            {/* State Hooks & Props */}
            <div className="space-y-2.5 pt-1">
              {selectedNode.stateHooks && selectedNode.stateHooks.length > 0 && (
                <div>
                  <h4 className="text-[10px] font-bold text-emerald-700 mono uppercase mb-1 flex items-center gap-1">
                    <Cpu className="w-3 h-3" />
                    State Hooks & Stores:
                  </h4>
                  <div className="flex flex-wrap gap-1">
                    {selectedNode.stateHooks.map((hook, i) => (
                      <span key={i} className="px-2 py-0.5 text-[10px] mono rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                        {hook}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {selectedNode.props && selectedNode.props.length > 0 && (
                <div>
                  <h4 className="text-[10px] font-bold text-blue-700 mono uppercase mb-1 flex items-center gap-1">
                    <Code2 className="w-3 h-3" />
                    Passed Props Contract:
                  </h4>
                  <div className="flex flex-wrap gap-1">
                    {selectedNode.props.map((p, i) => (
                      <span key={i} className="px-2 py-0.5 text-[10px] mono rounded bg-blue-50 text-blue-800 border border-blue-200">
                        {p}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
