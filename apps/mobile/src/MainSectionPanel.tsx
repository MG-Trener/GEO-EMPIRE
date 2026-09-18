import {
  MainSectionPanel as LegacyMainSectionPanel,
  type GameplaySection,
} from './MainSectionPanelLegacy';
import { TechnologyTreePanel } from './TechnologyTreePanel';

export type { GameplaySection } from './MainSectionPanelLegacy';

type Props = {
  section: GameplaySection;
  onMessage?: (message: string) => void;
};

export function MainSectionPanel({ section, onMessage }: Props) {
  if (section === 'technology') {
    return <TechnologyTreePanel onMessage={onMessage} />;
  }

  return <LegacyMainSectionPanel section={section} onMessage={onMessage} />;
}
