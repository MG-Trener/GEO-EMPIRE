import {
  MainSectionPanel as LegacyMainSectionPanel,
  type GameplaySection,
} from './MainSectionPanelLegacy';
import { TechnologyTreePanel } from './TechnologyTreePanel';

export type { GameplaySection } from './MainSectionPanelLegacy';

type Props = {
  section: GameplaySection;
  preferredDepositId?: string | null;
  onMessage?: (message: string) => void;
};

export function MainSectionPanel({ section, preferredDepositId, onMessage }: Props) {
  if (section === 'technology') {
    return <TechnologyTreePanel onMessage={onMessage} />;
  }

  return (
    <LegacyMainSectionPanel
      section={section}
      preferredDepositId={preferredDepositId}
      onMessage={onMessage}
    />
  );
}
