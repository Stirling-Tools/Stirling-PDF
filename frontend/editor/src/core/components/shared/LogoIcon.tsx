import React from "react";
import { useMantineColorScheme } from "@mantine/core";
import { useLogoPath } from "@app/hooks/useLogoPath";

interface LogoIconProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  alt?: string;
}

export function LogoIcon({
  alt = "",
  width = 24,
  height = 24,
  style,
  ...props
}: LogoIconProps) {
  const { colorScheme } = useMantineColorScheme();
  const logoPaths = useLogoPath();
  const src = colorScheme === "dark" ? logoPaths.dark : logoPaths.light;
  return (
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      style={{ aspectRatio: "1 / 1", ...style }}
      {...props}
    />
  );
}
