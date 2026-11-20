import React from "react";
export function Art({ kind = 0 }: { kind?: number }) {
  return (
    <svg
      viewBox="0 0 600 420"
      role="img"
      aria-label="Front-view diagram of the training stand: display panel, rear support and slotted base"
    >
      <rect
        width="600"
        height="420"
        fill={kind === 1 ? "#e9e6df" : "#edece7"}
      />
      <g fill="none" stroke="#b4b4a8" strokeWidth="1">
        <path d="M110 70v290M100 70h20M100 360h20M160 382h280M160 374v16M440 374v16" />
        <path d="M410 112h63M410 258h63M470 112v146" strokeDasharray="3 5" />
      </g>
      <g transform="translate(200 64)">
        <path d="M125 65h28v230h-28z" fill="#beb7a5" />
        <rect x="0" y="0" width="200" height="250" rx="5" fill="#c95130" />
        <path d="M14 14h172v222H14z" fill="none" stroke="#e2997d" />
        <path d="M36 55h96M36 68h65" stroke="#f7e4d5" strokeWidth="3" />
        <circle
          cx="100"
          cy="131"
          r="27"
          fill="none"
          stroke="#f4e1d0"
          strokeWidth="2"
        />
        <path
          d="m87 130 10 10 20-24"
          fill="none"
          stroke="#f4e1d0"
          strokeWidth="3"
        />
        <text
          x="36"
          y="200"
          fill="#f7e4d5"
          fontSize="10"
          fontFamily="sans-serif"
          letterSpacing="2"
        >
          HANDDOWN
        </text>
      </g>
      <rect x="153" y="314" width="294" height="31" rx="3" fill="#41463e" />
      <rect x="184" y="306" width="232" height="9" rx="2" fill="#727669" />
      <path d="M393 153h82" stroke="#7e8175" fill="none" />
      <circle cx="393" cy="153" r="3" fill="#7e8175" />
      <text
        x="481"
        y="158"
        fontFamily="sans-serif"
        fontSize="12"
        fill="#666b60"
      >
        01
      </text>
      <path d="M402 273h73" stroke="#7e8175" />
      <circle cx="402" cy="273" r="3" fill="#7e8175" />
      <text
        x="481"
        y="278"
        fontFamily="sans-serif"
        fontSize="12"
        fill="#666b60"
      >
        02
      </text>
      <path d="M435 330h40" stroke="#7e8175" />
      <circle cx="435" cy="330" r="3" fill="#7e8175" />
      <text
        x="481"
        y="335"
        fontFamily="sans-serif"
        fontSize="12"
        fill="#666b60"
      >
        03
      </text>
      <text x="36" y="40" fill="#696e62" fontSize="11" fontFamily="sans-serif">
        Training kit A / Front elevation
      </text>
      <text x="36" y="397" fill="#696e62" fontSize="10" fontFamily="sans-serif">
        REFERENCE DIAGRAM · NOT TO SCALE
      </text>
      <text
        x="507"
        y="397"
        fill="#696e62"
        fontSize="10"
        fontFamily="sans-serif"
      >
        FIG. A
      </text>
    </svg>
  );
}
