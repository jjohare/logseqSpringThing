import { ReactNode } from 'react';
import { createLogger } from '../../../lib/utils/logger';

const logger = createLogger('FormGroup');

// Main Form Group Component
interface FormGroupProps {
  /** Form group label */
  label: string;
  
  /** Unique identifier for the form group */
  id?: string;
  
  /** Form group children (typically form controls) */
  children: ReactNode;
  
  /** Optional help text */
  helpText?: string;
  
  /** Error message to display */
  error?: string;
  
  /** Whether the field is required */
  required?: boolean;
  
  /** Whether this is an advanced setting */
  advanced?: boolean;
  
  /** Additional CSS classes */
  className?: string;
}

/** FormGroup provides consistent layout and styling for form controls */
const FormGroup = ({
  label,
  id,
  children,
  helpText,
  error,
  required = false,
  advanced = false,
  className = '',
}: FormGroupProps) => {
  return (
    <div 
      className={`form-group space-y-2 mb-4 ${advanced ? 'advanced-setting' : ''} ${className}`}
      data-testid={`form-group-${id || label.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <div className="flex justify-between items-center">
        <label 
          htmlFor={id} 
          className={`text-sm font-medium ${error ? 'text-destructive' : ''}`}
        >
          {label}
          {required && <span className="text-destructive ml-1">*</span>}
          {advanced && <span className="text-muted-foreground ml-2 text-xs">(Advanced)</span>}
        </label>
      </div>
      
      <div className="control-wrapper">{children}</div>
      
      {(helpText || error) && (
        <div className="text-xs">
          {error ? (
            <p className="text-destructive">{error}</p>
          ) : helpText ? (
            <p className="text-muted-foreground">{helpText}</p>
          ) : null}
        </div>
      )}
    </div>
  );
};

// Subcomponents for specific form control types
interface FormGroupControlProps {
  /** Control children */
  children: ReactNode;
  
  /** Additional CSS classes */
  className?: string;
}

/** Container for form controls with consistent styling */
const FormGroupControl = ({ children, className = '' }: FormGroupControlProps) => (
  <div className={`w-full ${className}`}>{children}</div>
);

interface FormGroupRowProps {
  /** Row children */
  children: ReactNode;
  
  /** Additional CSS classes */
  className?: string;
}

/** Row layout for horizontal form controls */
const FormGroupRow = ({ children, className = '' }: FormGroupRowProps) => (
  <div className={`flex flex-wrap items-center gap-2 ${className}`}>{children}</div>
);

interface FormGroupColumnProps {
  /** Column children */
  children: ReactNode;
  
  /** Column width (12 = full width) */
  width?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
  
  /** Additional CSS classes */
  className?: string;
}

/** Column layout for vertical form controls */
const FormGroupColumn = ({ 
  children, 
  width = 12,
  className = '' 
}: FormGroupColumnProps) => {
  const widthClass = `w-${width}/12`;
  
  return (
    <div className={`${widthClass} ${className}`}>{children}</div>
  );
};

// Export the components
export { 
  FormGroup, 
  FormGroupControl,
  FormGroupRow,
  FormGroupColumn
};