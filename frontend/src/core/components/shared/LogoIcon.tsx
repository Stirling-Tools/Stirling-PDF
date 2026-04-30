import React from "react";
import { useMantineColorScheme } from "@mantine/core";
import { useLogoPath } from "@app/hooks/useLogoPath";

interface LogoIconProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  alt?: string;
}

export function LogoIcon({ alt = "", ...props }: LogoIconProps) {
  const { colorScheme } = useMantineColorScheme();
  const logoPaths = useLogoPath();
  const src = colorScheme === "dark" ? logoPaths.dark : logoPaths.light;
  return <img src={src} alt={alt} {...props} />;
}
