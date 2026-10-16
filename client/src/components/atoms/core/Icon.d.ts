export type IconName =
  | "check" | "x" | "plus" | "minus" | "search" | "settings" | "calendar"
  | "chevron-right" | "chevron-left" | "chevron-down" | "chevron-up"
  | "arrow-right" | "arrow-left" | "arrow-up-right" | "star" | "circle"
  | "more-horizontal" | "more-vertical" | "trash" | "pencil" | "sun" | "moon"
  | "book" | "bookmark" | "share" | "tag" | "bell" | "user" | "menu" | "sparkles"
  | "clock" | "filter" | "archive" | "hash" | "target" | "flag" | "palette"
  | "layout-grid" | "list" | "command" | "inbox" | "panel-left" | "repeat" | "grip"
  | "quote" | "feather" | "trophy" | "utensils" | "coffee" | "heart" | "pill"
  | "droplet" | "cloud" | "cloud-sun" | "mic" | "type" | "bold" | "italic"
  | "leaf" | "smile" | "activity" | "map-pin" | "check-circle" | "plus-circle" | "moon2"
  | "mood-1" | "mood-2" | "mood-3" | "mood-4" | "mood-5" | "image";

export interface IconProps {
  /** Icon name from the curated Lucide set. */
  name: IconName;
  /** Pixel size (width & height). Default 20. */
  size?: number;
  /** Stroke width. Default 2. */
  strokeWidth?: number;
  style?: React.CSSProperties;
  className?: string;
}

/** Inline stroke icon from Chronicles' curated Lucide set. */
export function Icon(props: IconProps): JSX.Element;
