import * as React from "react"

import { cn } from "@/lib/utils"

const Textarea = React.forwardRef(({ className, ...props }, ref) => {
  // Normalize null `value` to empty string to avoid React warning
  // Keep `undefined` untouched so component can be uncontrolled when needed
  const valueProp = Object.prototype.hasOwnProperty.call(props, 'value')
    ? (props.value == null ? '' : props.value)
    : undefined;

  return (
    <textarea
      className={cn(
        "flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      )}
      ref={ref}
      {...props}
      value={valueProp}
    />
  );
})
Textarea.displayName = "Textarea"

export { Textarea }
