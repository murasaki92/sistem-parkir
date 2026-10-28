"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import styles from "./Popover.module.css";

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;
const PopoverAnchor = PopoverPrimitive.Anchor;

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> & {
    removeBackgroundAndPadding?: boolean;
  }
>(
  (
    {
      className,
      align = "center",
      sideOffset = 4,
      removeBackgroundAndPadding,
      ...props
    },
    ref,
  ) => (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        className={`${
          removeBackgroundAndPadding ? styles.bare : styles.content
        } ${className || ""}`}
        {...props}
      />
    </PopoverPrimitive.Portal>
  ),
);
PopoverContent.displayName = PopoverPrimitive.Content.displayName;

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor };
