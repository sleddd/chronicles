'use client';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import {
  faBook,
  faHeart,
  faStar,
  faBriefcase,
  faHome,
  faUtensils,
  faDumbbell,
  faBrain,
  faMusic,
  faCamera,
  faPlane,
  faCar,
  faGraduationCap,
  faCode,
  faGamepad,
  faPaintBrush,
  faLightbulb,
  faBolt,
  faLeaf,
  faSun,
  faMoon,
  faCloud,
  faFire,
  faWater,
  faMountain,
  faTree,
  faFlask,
  faPills,
  faAppleWhole,
  faCoffee,
  faWineGlass,
  faBed,
  faRunning,
  faBicycle,
  faSwimmer,
  faHiking,
  faPray,
  faHandHoldingHeart,
  faUsers,
  faUserFriends,
  faBaby,
  faDog,
  faCat,
  faMoneyBillWave,
  faCreditCard,
  faChartLine,
  faCalendarCheck,
  faClipboardList,
  faFlag,
  faTrophy,
  faMedal,
  faGem,
  faCrown,
  faShoppingCart,
  faGift,
  faEnvelope,
  faPhone,
  faComments,
  faBookOpen,
  faPen,
  faFilm,
  faTv,
  faHeadphones,
  faGuitar,
  faBasketballBall,
  faFootballBall,
  faVolleyballBall,
  faBaseballBall,
  faGolfBall,
  faCheck,
  faCircleCheck,
  faMagnifyingGlass,
  faCalendar,
  faBullseye,
} from '@fortawesome/free-solid-svg-icons';

export interface IconOption {
  name: string;
  icon: IconDefinition;
}

// Curated list of icons for topics, grouped by category
export const TOPIC_ICONS: IconOption[] = [
  // Tasks & Actions
  { name: 'check', icon: faCheck },
  { name: 'circle-check', icon: faCircleCheck },
  { name: 'clipboard-list', icon: faClipboardList },
  { name: 'calendar-check', icon: faCalendarCheck },
  { name: 'calendar', icon: faCalendar },
  { name: 'bullseye', icon: faBullseye },
  { name: 'flag', icon: faFlag },

  // General
  { name: 'book', icon: faBook },
  { name: 'book-open', icon: faBookOpen },
  { name: 'pen', icon: faPen },
  { name: 'magnifying-glass', icon: faMagnifyingGlass },
  { name: 'heart', icon: faHeart },
  { name: 'star', icon: faStar },
  { name: 'lightbulb', icon: faLightbulb },
  { name: 'bolt', icon: faBolt },

  // Work & Education
  { name: 'briefcase', icon: faBriefcase },
  { name: 'graduation-cap', icon: faGraduationCap },
  { name: 'code', icon: faCode },
  { name: 'chart-line', icon: faChartLine },

  // Health & Wellness
  { name: 'brain', icon: faBrain },
  { name: 'pills', icon: faPills },
  { name: 'flask', icon: faFlask },
  { name: 'dumbbell', icon: faDumbbell },
  { name: 'running', icon: faRunning },
  { name: 'bicycle', icon: faBicycle },
  { name: 'swimmer', icon: faSwimmer },
  { name: 'hiking', icon: faHiking },
  { name: 'bed', icon: faBed },
  { name: 'pray', icon: faPray },

  // Food & Drink
  { name: 'utensils', icon: faUtensils },
  { name: 'apple-whole', icon: faAppleWhole },
  { name: 'coffee', icon: faCoffee },
  { name: 'wine-glass', icon: faWineGlass },

  // Hobbies & Entertainment
  { name: 'music', icon: faMusic },
  { name: 'guitar', icon: faGuitar },
  { name: 'headphones', icon: faHeadphones },
  { name: 'camera', icon: faCamera },
  { name: 'paint-brush', icon: faPaintBrush },
  { name: 'gamepad', icon: faGamepad },
  { name: 'film', icon: faFilm },
  { name: 'tv', icon: faTv },

  // Sports
  { name: 'basketball-ball', icon: faBasketballBall },
  { name: 'football-ball', icon: faFootballBall },
  { name: 'volleyball-ball', icon: faVolleyballBall },
  { name: 'baseball-ball', icon: faBaseballBall },
  { name: 'golf-ball', icon: faGolfBall },

  // Nature
  { name: 'leaf', icon: faLeaf },
  { name: 'tree', icon: faTree },
  { name: 'mountain', icon: faMountain },
  { name: 'sun', icon: faSun },
  { name: 'moon', icon: faMoon },
  { name: 'cloud', icon: faCloud },
  { name: 'fire', icon: faFire },
  { name: 'water', icon: faWater },

  // Travel
  { name: 'plane', icon: faPlane },
  { name: 'car', icon: faCar },
  { name: 'home', icon: faHome },

  // People & Relationships
  { name: 'users', icon: faUsers },
  { name: 'user-friends', icon: faUserFriends },
  { name: 'baby', icon: faBaby },
  { name: 'hand-holding-heart', icon: faHandHoldingHeart },

  // Pets
  { name: 'dog', icon: faDog },
  { name: 'cat', icon: faCat },

  // Money & Shopping
  { name: 'money-bill-wave', icon: faMoneyBillWave },
  { name: 'credit-card', icon: faCreditCard },
  { name: 'shopping-cart', icon: faShoppingCart },
  { name: 'gift', icon: faGift },

  // Achievements
  { name: 'trophy', icon: faTrophy },
  { name: 'medal', icon: faMedal },
  { name: 'gem', icon: faGem },
  { name: 'crown', icon: faCrown },

  // Communication
  { name: 'envelope', icon: faEnvelope },
  { name: 'phone', icon: faPhone },
  { name: 'comments', icon: faComments },
];

// Map icon names to their definitions for lookup
export const ICON_MAP: Record<string, IconDefinition> = TOPIC_ICONS.reduce(
  (acc, { name, icon }) => {
    acc[name] = icon;
    return acc;
  },
  {} as Record<string, IconDefinition>
);

interface IconPickerProps {
  selectedIcon: string | null;
  onSelectIcon: (iconName: string | null) => void;
}

export function IconPicker({ selectedIcon, onSelectIcon }: IconPickerProps) {
  return (
    <div className="grid grid-cols-8 gap-1 p-2 max-h-32 overflow-auto">
      {/* No icon option */}
      <button
        type="button"
        onClick={() => onSelectIcon(null)}
        className={`w-6 h-6 rounded flex items-center justify-center border ${
          selectedIcon === null ? 'border-border backdrop-blur-sm bg-white/40' : 'border-transparent hover:backdrop-blur-sm bg-white/40'
        }`}
        title="No icon"
      >
        <span className="text-xs text-gray-400">×</span>
      </button>
      {TOPIC_ICONS.map(({ name, icon }) => (
        <button
          key={name}
          type="button"
          onClick={() => onSelectIcon(name)}
          className={`w-6 h-6 rounded flex items-center justify-center border ${
            selectedIcon === name ? 'border-border backdrop-blur-sm bg-white/40' : 'border-transparent hover:backdrop-blur-sm bg-white/40'
          }`}
          title={name}
        >
          <FontAwesomeIcon
            icon={icon}
            className="w-3.5 h-3.5"
            style={{ color: selectedIcon === name ? '#374151' : '#6B7280' }}
          />
        </button>
      ))}
    </div>
  );
}

interface TopicIconProps {
  iconName: string | null;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  color?: string;
}

export function TopicIcon({ iconName, size = 'sm', className = '', color }: TopicIconProps) {
  if (!iconName || !ICON_MAP[iconName]) {
    // Show a dot as fallback when no icon
    const sizeClasses = {
      sm: 'w-2.5 h-2.5',
      md: 'w-3 h-3',
      lg: 'w-4 h-4',
    };
    return (
      <span
        className={`rounded-full ${sizeClasses[size]} ${className}`}
        style={{ backgroundColor: color || '#9ca3af' }}
      />
    );
  }

  const sizeClasses = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  };

  return (
    <FontAwesomeIcon
      icon={ICON_MAP[iconName]}
      className={`${sizeClasses[size]} ${className}`}
      style={color ? { color } : undefined}
    />
  );
}
