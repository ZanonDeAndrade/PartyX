/**
 * Ícones do site: traço de 2 px, cantos retos e o corte diagonal do X quando cabe. Só onde ajudam a reconhecer uma ação
 * (buscar, menu, fechar, copiar, voltar); nunca decoração. Sempre `aria-hidden`: o nome acessível vem do texto ou do botão.
 */
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 20, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconSearch = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <path d="M15.5 15.5 21 21" />
  </Svg>
);
export const IconMenu = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 6h18M3 12h18M3 18h12" />
  </Svg>
);
export const IconClose = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 5l14 14M19 5 5 19" />
  </Svg>
);
export const IconCopy = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 8h12v12H8z" />
    <path d="M16 8V4H4v12h4" />
  </Svg>
);
export const IconCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 12.5 9.5 18 20 6" />
  </Svg>
);
export const IconBack = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15 4 7 12l8 8" />
  </Svg>
);
export const IconShare = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3v13M7 8l5-5 5 5" />
    <path d="M5 12v9h14v-9" />
  </Svg>
);
export const IconLink = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 14a4 4 0 0 0 5.7 0l3.6-3.6a4 4 0 0 0-5.7-5.7L12 6.3" />
    <path d="M14 10a4 4 0 0 0-5.7 0l-3.6 3.6a4 4 0 0 0 5.7 5.7l1.6-1.6" />
  </Svg>
);
export const IconTicket = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 6h18v4a2 2 0 0 0 0 4v4H3v-4a2 2 0 0 0 0-4z" />
    <path d="M14 6v12" strokeDasharray="2 2" />
  </Svg>
);
export const IconCamera = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 7h4l2-3h6l2 3h4v13H3z" />
    <circle cx="12" cy="13" r="4" />
  </Svg>
);
export const IconKeyboard = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2 6h20v12H2z" />
    <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" />
  </Svg>
);
export const IconExpand = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
  </Svg>
);
export const IconDownload = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3v12M7 10l5 5 5-5M4 20h16" />
  </Svg>
);
export const IconAlert = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3 2 20h20z" />
    <path d="M12 10v4M12 17v.01" />
  </Svg>
);
export const IconReceipt = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z" />
    <path d="M9 8h6M9 12h6" />
  </Svg>
);
export const IconUser = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
  </Svg>
);
export const IconChevron = (p: IconProps) => (
  <Svg {...p}>
    <path d="m9 5 7 7-7 7" />
  </Svg>
);
