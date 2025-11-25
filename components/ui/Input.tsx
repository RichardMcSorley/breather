import { InputHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = "", ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 dark:focus:ring-green-400 focus:border-transparent min-h-[44px] text-gray-900 dark:text-white bg-white dark:bg-gray-800 placeholder:text-gray-400 dark:placeholder:text-gray-500 ${error ? "border-red-500 dark:border-red-500" : "border-gray-300 dark:border-gray-600"} ${className}`}
          style={
            props.type === "date"
              ? {
                  maxWidth: "100%",
                  boxSizing: "border-box",
                  ...(className.includes("text-center") ? { textAlign: "center" } : {}),
                }
              : undefined
          }
          {...props}
        />
        {error && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>
    );
  }
);

Input.displayName = "Input";

export default Input;


