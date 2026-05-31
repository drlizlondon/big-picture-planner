// Template Panel Component
import React from 'react';
import { useTemplates, useCategories } from '../../hooks/usePlannerData';
import { createBlock } from '../../services/plannerActions';

export const TemplatePanel: React.FC = () => {
  const templates = useTemplates();
  const categories = useCategories();
  
  const categoryMap = categories?.reduce((acc, cat) => {
    acc[cat.id] = cat;
    return acc;
  }, {} as Record<string, any>) || {};

  const handleUseTemplate = async (template: any) => {
    const { id, isArchived, createdAt, updatedAt, ...templateData } = template;
    await createBlock({
      ...templateData,
      isScheduled: false,
      isBaseEvent: false,
      isHidden: false,
      sourceType: 'template_instance'
    });
  };

  if (!templates || templates.length === 0) return null;

  return (
    <div className="flex flex-col bg-surface-primary rounded-medium border border-border-default p-4 shadow-sm min-h-[150px] max-h-[300px] overflow-hidden flex-shrink-0">
      <h2 className="text-[16px] font-semibold mb-4">Templates</h2>
      <div className="flex flex-col gap-2 overflow-y-auto">
        {templates.map(template => (
          <div 
            key={template.id}
            onClick={() => handleUseTemplate(template)}
            className="p-3 bg-background rounded-small border border-border-default cursor-pointer hover:shadow-card transition-all group relative overflow-hidden flex gap-3 shadow-sm"
          >
            {template.categoryId && categoryMap[template.categoryId] && (
              <div className="absolute left-0 top-0 bottom-0 w-[4px]" style={{ backgroundColor: categoryMap[template.categoryId].colorHex }} />
            )}
            <div className="flex-1 min-w-0 pl-1">
              <div className="text-[13px] font-semibold text-text-primary truncate">{template.title}</div>
              <div className="text-[11px] font-medium text-text-secondary mt-1">{template.durationMinutes} min</div>
            </div>
            <div className="absolute right-2 top-2 hidden group-hover:flex gap-1 z-20">
              <button className="text-text-muted hover:text-text-primary bg-surface-primary rounded shadow-sm border border-border-default text-[10px] font-bold px-2 py-1" title="Add to Life Inbox">
                Use
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
