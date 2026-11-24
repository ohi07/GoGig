import React from "react";

export default function Rating({ value = 0 }) {
  const stars = Array.from({ length: 5 }).map((_, i) => {
    const fillClass = i < value ? "text-yellow-400" : "text-gray-300";
    return (
      <svg
        key={i}
        className={`w-4 h-4 ${fillClass}`}
        fill="currentColor"
        viewBox="0 0 20 20"
        aria-hidden="true"
      >
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.95a1 1 0 00.95.69h4.162c.969 0 1.371 1.24.588 1.81l-3.372 2.455a1 1 0 00-.364 1.118l1.287 3.95c.3.921-.755 1.688-1.54 1.118l-3.372-2.455a1 1 0 00-1.175 0L5.21 17.56c-.784.57-1.838-.197-1.539-1.118l1.287-3.95a1 1 0 00-.364-1.118L1.223 8.92c-.783-.57-.38-1.81.588-1.81h4.162a1 1 0 00.95-.69l1.286-3.95z" />
      </svg>
    );
  });

  return <div className="flex items-center gap-1">{stars}</div>;
}