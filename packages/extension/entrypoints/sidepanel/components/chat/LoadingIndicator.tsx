import React from 'react'

export function LoadingIndicator() {
  return (
    <div className="flex items-center px-3 py-1">
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
        className="text-muted-foreground"
      >
        <style>{`.ag_d1{animation:ag_k1 .8s linear infinite}.ag_d2{animation-delay:-.65s}.ag_d3{animation-delay:-.5s}@keyframes ag_k1{93.75%,100%{r:3px}46.875%{r:.2px}}`}</style>
        <circle className="ag_d1" cx="4" cy="12" r="3" fill="currentColor" />
        <circle className="ag_d1 ag_d2" cx="12" cy="12" r="3" fill="currentColor" />
        <circle className="ag_d1 ag_d3" cx="20" cy="12" r="3" fill="currentColor" />
      </svg>
    </div>
  )
}
