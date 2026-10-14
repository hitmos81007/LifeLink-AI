import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hoverEffect?: boolean;
}

export const Card: React.FC<CardProps> = ({
  hoverEffect = false,
  className = '',
  children,
  ...props
}) => {
  return (
    <div
      className={`
        bg-white dark:bg-slate-900 
        border border-slate-200 dark:border-slate-800 
        rounded-2xl shadow-xs 
        text-slate-900 dark:text-white
        transition-all duration-200
        ${hoverEffect ? 'hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700' : ''}
        ${className}
      `}
      {...props}
    >
      {children}
    </div>
  );
};

export const CardHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className = '',
  children,
  ...props
}) => {
  return (
    <div
      className={`p-5 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-4 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export const CardTitle: React.FC<React.HTMLAttributes<HTMLHeadingElement>> = ({
  className = '',
  children,
  ...props
}) => {
  return (
    <h3
      className={`text-base font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2 ${className}`}
      {...props}
    >
      {children}
    </h3>
  );
};

export const CardDescription: React.FC<React.HTMLAttributes<HTMLParagraphElement>> = ({
  className = '',
  children,
  ...props
}) => {
  return (
    <p
      className={`text-xs text-slate-500 dark:text-slate-400 mt-0.5 ${className}`}
      {...props}
    >
      {children}
    </p>
  );
};

export const CardContent: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className = '',
  children,
  ...props
}) => {
  return (
    <div className={`p-5 ${className}`} {...props}>
      {children}
    </div>
  );
};

export const CardFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  className = '',
  children,
  ...props
}) => {
  return (
    <div
      className={`p-4 bg-slate-50/80 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800/80 rounded-b-2xl ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
