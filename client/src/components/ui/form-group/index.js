import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { createLogger } from '../../../lib/utils/logger';
const logger = createLogger('FormGroup');
/** FormGroup provides consistent layout and styling for form controls */
const FormGroup = ({ label, id, children, helpText, error, required = false, advanced = false, className = '', }) => {
    return (_jsxs("div", { className: `form-group space-y-2 mb-4 ${advanced ? 'advanced-setting' : ''} ${className}`, "data-testid": `form-group-${id || label.toLowerCase().replace(/\s+/g, '-')}`, children: [_jsx("div", { className: "flex justify-between items-center", children: _jsxs("label", { htmlFor: id, className: `text-sm font-medium ${error ? 'text-destructive' : ''}`, children: [label, required && _jsx("span", { className: "text-destructive ml-1", children: "*" }), advanced && _jsx("span", { className: "text-muted-foreground ml-2 text-xs", children: "(Advanced)" })] }) }), _jsx("div", { className: "control-wrapper", children: children }), (helpText || error) && (_jsx("div", { className: "text-xs", children: error ? (_jsx("p", { className: "text-destructive", children: error })) : helpText ? (_jsx("p", { className: "text-muted-foreground", children: helpText })) : null }))] }));
};
/** Container for form controls with consistent styling */
const FormGroupControl = ({ children, className = '' }) => (_jsx("div", { className: `w-full ${className}`, children: children }));
/** Row layout for horizontal form controls */
const FormGroupRow = ({ children, className = '' }) => (_jsx("div", { className: `flex flex-wrap items-center gap-2 ${className}`, children: children }));
/** Column layout for vertical form controls */
const FormGroupColumn = ({ children, width = 12, className = '' }) => {
    const widthClass = `w-${width}/12`;
    return (_jsx("div", { className: `${widthClass} ${className}`, children: children }));
};
// Export the components
export { FormGroup, FormGroupControl, FormGroupRow, FormGroupColumn };
