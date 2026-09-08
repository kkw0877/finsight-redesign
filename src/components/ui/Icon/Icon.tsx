import type { SVGAttributes } from "react";
import { icons, type IconName } from "./icons";

export interface IconProps extends SVGAttributes<SVGSVGElement> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 20, ...rest }: IconProps) {
  const glyph = icons[name];

  return (
    <svg
      width={size}
      height={size}
      viewBox={glyph.viewBox}
      fill="currentColor"
      aria-hidden="true"
      {...rest}
    >
      <path d={glyph.path} />
    </svg>
  );
}

export type { IconName };
