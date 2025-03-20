import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Label } from './ui/label';
import { Slider } from './ui/slider';
import { Switch } from './ui/switch';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { InfoIcon } from 'lucide-react';
export function SettingControlComponent({ path, setting, value, onChange }) {
    // Format array values for display in inputs
    const [inputValue, setInputValue] = useState(() => {
        if (Array.isArray(value)) {
            return value.join(', ');
        }
        return String(value ?? '');
    });
    // Handler for input changes (for debouncing text/number inputs)
    const handleInputChange = (e) => {
        setInputValue(e.target.value);
    };
    // Apply input value on blur or Enter key
    const handleInputBlur = () => {
        applyInputValue();
    };
    const handleInputKeyDown = (e) => {
        if (e.key === 'Enter') {
            applyInputValue();
        }
    };
    // Apply the current input value to the setting
    const applyInputValue = () => {
        switch (setting.type) {
            case 'number':
                onChange(parseFloat(inputValue));
                break;
            case 'text':
                // Handle array values like "1, 2, 3" -> [1, 2, 3]
                if (Array.isArray(value)) {
                    const items = inputValue.split(',').map(item => item.trim());
                    // Convert to numbers if the original value was numeric
                    if (value.every(item => typeof item === 'number')) {
                        onChange(items.map(item => parseFloat(item)));
                    }
                    else {
                        onChange(items);
                    }
                }
                else {
                    onChange(inputValue);
                }
                break;
        }
    };
    // Render appropriate control based on setting type
    const renderControl = () => {
        switch (setting.type) {
            case 'slider':
                return (_jsxs("div", { className: "flex w-full flex-col gap-2", children: [_jsxs("div", { className: "flex justify-between", children: [_jsx("span", { className: "text-xs", children: setting.min ?? 0 }), _jsx("span", { className: "text-xs", children: value }), _jsx("span", { className: "text-xs", children: setting.max ?? 1 })] }), _jsx(Slider, { value: [value], min: setting.min ?? 0, max: setting.max ?? 1, step: setting.step ?? 0.1, onValueChange: ([val]) => onChange(val) })] }));
            case 'toggle':
                return (_jsx(Switch, { checked: Boolean(value), onCheckedChange: onChange }));
            case 'color':
                return (_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(Input, { type: "color", value: value, onChange: (e) => onChange(e.target.value), className: "h-8 w-12 cursor-pointer p-0" }), _jsx(Input, { type: "text", value: value, onChange: (e) => onChange(e.target.value), className: "h-8 w-24" })] }));
            case 'select':
                return (_jsxs(Select, { value: value, onValueChange: onChange, children: [_jsx(SelectTrigger, { className: "h-8 w-full", children: _jsx(SelectValue, { placeholder: "Select option" }) }), _jsx(SelectContent, { children: setting.options?.map((option) => (_jsx(SelectItem, { value: option, children: option }, option))) })] }));
            case 'number':
                return (_jsx(Input, { type: "number", value: inputValue, onChange: handleInputChange, onBlur: handleInputBlur, onKeyDown: handleInputKeyDown, min: setting.min, max: setting.max, step: setting.step ?? 1, className: "h-8 w-full" }));
            case 'text':
            default:
                return (_jsx(Input, { type: "text", value: inputValue, onChange: handleInputChange, onBlur: handleInputBlur, onKeyDown: handleInputKeyDown, className: "h-8 w-full" }));
        }
    };
    return (_jsxs("div", { className: "setting-control flex items-center justify-between gap-4 py-1.5", children: [_jsxs("div", { className: "flex items-center gap-1", children: [_jsx(Label, { htmlFor: path, className: "text-sm", children: setting.label }), setting.tooltip && (_jsx(TooltipProvider, { children: _jsxs(Tooltip, { children: [_jsx(TooltipTrigger, { asChild: true, children: _jsx(InfoIcon, { className: "h-3 w-3 text-muted-foreground" }) }), _jsx(TooltipContent, { children: _jsx("p", { className: "max-w-xs text-xs", children: setting.tooltip }) })] }) }))] }), _jsx("div", { className: "flex-shrink-0", children: renderControl() })] }));
}
