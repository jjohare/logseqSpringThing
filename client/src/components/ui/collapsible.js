import { jsx as _jsx } from "react/jsx-runtime";
import * as React from "react";
import * as CollapsiblePrimitive from "@radix-ui/react-collapsible";
import { cn } from "@/lib/utils";
const Collapsible = CollapsiblePrimitive.Root;
const CollapsibleTrigger = CollapsiblePrimitive.CollapsibleTrigger;
const CollapsibleContent = React.forwardRef(({ className, ...props }, ref) => (_jsx(CollapsiblePrimitive.CollapsibleContent, { ref: ref, className: cn("data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down overflow-hidden transition-all", className), ...props })));
CollapsibleContent.displayName = "CollapsibleContent";
export { Collapsible, CollapsibleTrigger, CollapsibleContent };
