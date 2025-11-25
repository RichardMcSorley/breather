"use client";

interface TagProps {
  label: string;
  onRemove?: () => void;
  variant?: "default" | "income" | "expense";
  showRemove?: boolean;
}

export default function Tag({ label, onRemove, variant = "default", showRemove = false }: TagProps) {
  const baseStyles = "inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors";
  
  const variantStyles = {
    default: "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300",
    income: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300",
    expense: "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300",
  };

  return (
    <span className={`${baseStyles} ${variantStyles[variant]}`}>
      {label}
      {showRemove && onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-1 hover:bg-black/10 dark:hover:bg-white/10 rounded-full p-0.5 transition-colors"
          aria-label={`Remove ${label}`}
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      )}
    </span>
  );
}
