import React from "react";
import { useCachedImage } from "@/lib/image-cache";

type Props = Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src: string | undefined | null;
};

/** <img> that resolves its src through the persistent image cache. */
export function CachedImage({ src, ...rest }: Props) {
  const resolved = useCachedImage(src);
  return <img src={resolved} {...rest} />;
}
