export interface Setting {
  key: string;
  value: unknown;
  updatedAt: string;
}

export interface UpsertSettingRequest {
  key: string;
  value: unknown;
}

export interface FeatureFlags {
  foodEnabled: boolean;
  medicationEnabled: boolean;
  goalsEnabled: boolean;
  milestonesEnabled: boolean;
  exerciseEnabled: boolean;
  allergiesEnabled: boolean;
}

export interface ThemeSettings {
  headerColor: string;
  accentColor: string;
}
