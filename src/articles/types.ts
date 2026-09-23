import type { ComponentType } from 'react';

export type ArticleMeta = {
  slug: string;
  title: string;
  subtitle: string;
  category: string;
  description: string;
  component: ComponentType;
};
