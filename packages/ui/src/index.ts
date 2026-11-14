// Design system: tokens and components. Every new visual element starts here and is shown in
// the gallery at /dev/ui. Global styles: `import '@questclass/ui/styles.css'` once in the app.
export * from './icons';
export { Accordion, type AccordionItem, type AccordionProps } from './components/Accordion';
export {
  AppFrame,
  BottomNav,
  Brand,
  SideNav,
  TopBar,
  type AppFrameProps,
  type BottomNavProps,
  type BrandProps,
  type NavItem,
  type SideNavProps,
  type TopBarProps,
} from './components/AppFrame';
export {
  AnimatedHero,
  type AnimatedHeroProps,
  type HeroMotion,
  type HeroSprite,
} from './components/AnimatedHero/AnimatedHero';
export { AuthFrame, type AuthFrameProps } from './components/AuthFrame';
export { Avatar, type AvatarProps } from './components/Avatar';
export { Badge, type BadgeProps, type BadgeTone } from './components/Badge';
export {
  Button,
  buttonClassName,
  ButtonLink,
  IconButton,
  type ButtonLinkProps,
  type ButtonProps,
  type ButtonSize,
  type ButtonVariant,
  type IconButtonProps,
} from './components/Button';
export { Card, type CardProps } from './components/Card';
export {
  CategoryFilter,
  type CategoryFilterProps,
  type CategoryOption,
  type CategoryTone,
} from './components/CategoryFilter';
export {
  ActionList,
  ActionRow,
  ChoiceTile,
  type ActionListProps,
  type ActionRowProps,
  type ActionRowStatus,
  type ChoiceTileProps,
} from './components/ChoiceTile';
export {
  Celebration,
  type CelebrationProps,
  type CelebrationReward,
  type PassCelebrationProps,
  type PurchaseCelebrationProps,
  type StreakCelebrationProps,
  type Totals,
} from './components/Celebration/Celebration';
export {
  markStreakCelebrated,
  STREAK_CELEBRATION_PREFIX,
  streakCelebrationKey,
  wasStreakCelebrated,
  type MarkerStorage,
} from './components/Celebration/streakOnce';
export { DataTable, type Column, type DataTableProps } from './components/DataTable';
export { EmptyState, type EmptyStateProps } from './components/EmptyState';
export {
  DateTimeInput,
  Field,
  Select,
  Textarea,
  TextInput,
  useFieldControl,
  type FieldProps,
  type SelectOption,
  type SelectProps,
  type TextareaProps,
  type TextInputProps,
} from './components/Field';
export { FileInput, type FileInputProps } from './components/FileInput';
export { ItemCard, type ItemCardProps } from './components/ItemCard';
export { Container, Grid, Inline, Stack, type Gap } from './components/Layout';
export { LessonCard, type LessonCardProps } from './components/LessonCard';
export { UiLink, UiLinkProvider, type UiLinkProps } from './components/Link';
export {
  formatTime,
  MediaPlayer,
  SHUTTER_MAX_PCT,
  SHUTTER_MIN_PCT,
  SKIP_SECONDS,
  type MediaClip,
  type MediaPlayerProps,
  type MediaSource,
  type ShutterState,
} from './components/MediaPlayer/MediaPlayer';
export { Menu, type MenuAction, type MenuProps } from './components/Menu';
export { Notice, type NoticeProps, type NoticeTone } from './components/Notice';
export { NumberInput, type NumberInputProps } from './components/NumberInput';
export { Drawer, Modal, Sheet, type OverlayProps } from './components/Overlay';
export { PinPad, type PinPadProps } from './components/PinPad';
export { PlayerFrame, type PlayerFrameProps } from './components/PlayerFrame';
export { Placeholder, type PlaceholderKind, type PlaceholderProps } from './components/Placeholder';
export {
  ProgressBar,
  ProgressRing,
  type ProgressBarProps,
  type ProgressRingProps,
  type ProgressTone,
} from './components/Progress';
export {
  OptionTile,
  QuestionCard,
  type OptionState,
  type OptionTileProps,
  type QuestionCardProps,
} from './components/QuestionCard';
export {
  AnswerReview,
  ResultSummary,
  RewardLine,
  type AnswerReviewProps,
  type ResultSummaryProps,
  type ResultTone,
  type ReviewAnswer,
  type ReviewItem,
  type RewardLineProps,
} from './components/Result';
export {
  ShopItemCard,
  ShopMark,
  ShopPreview,
  type ShopItemCardProps,
  type ShopMarkProps,
  type ShopPreviewProps,
} from './components/ShopItemCard';
export { Skeleton, type SkeletonProps } from './components/Skeleton';
export { Slider, type SliderProps } from './components/Slider';
export { Spinner, type SpinnerProps } from './components/Spinner';
export { SpriteImage, type SpriteCell, type SpriteImageProps } from './components/SpriteImage';
export { StatChip, type StatChipProps, type StatKind } from './components/StatChip';
export { StepList, type Step, type StepStatus } from './components/StepList';
export { StreakCard, type StreakCardProps } from './components/StreakCard';
export {
  SegmentedControl,
  Tabs,
  type SegmentedControlProps,
  type SegmentOption,
  type TabItem,
  type TabsProps,
} from './components/Tabs';
export {
  Toast,
  ToastProvider,
  useToast,
  type ToastOptions,
  type ToastTone,
} from './components/Toast';
export { Checkbox, Switch } from './components/Toggle';
export { Tooltip, type TooltipProps } from './components/Tooltip';
export { WishCard, type WishCardProps } from './components/WishCard';
export {
  Heading,
  Text,
  VisuallyHidden,
  type HeadingLevel,
  type HeadingProps,
  type TextProps,
} from './components/Typography';
