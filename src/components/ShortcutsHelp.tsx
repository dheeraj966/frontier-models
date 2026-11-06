import { usePreferences } from '../state/preferences';
import { vizPlugins } from '../viz/registry';
import Modal from './Modal';
import Icon from './Icon';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
export const MOD = isMac ? '⌘' : 'Ctrl';

export default function ShortcutsHelp() {
  const { helpOpen, setHelpOpen } = usePreferences();
  const rows: [string[], string][] = [
    [[MOD, 'K'], 'Search models, views & actions'],
    [['/'], 'Search (alternative)'],
    ...vizPlugins.map((p, i) => [[String(i + 1)], `Go to ${p.title}`] as [string[], string]),
    [['W'], 'Composite weights'],
    [['T'], 'Toggle light / dark'],
    [['D'], 'Switch Simple / Detailed'],
    [['←', '→'], 'Previous / next model (on a model page)'],
    [['C'], 'Compare this model (on a model page)'],
    [['?'], 'This help'],
  ];
  return (
    <Modal open={helpOpen} onClose={() => setHelpOpen(false)} label="Keyboard shortcuts" className="help">
      <div className="sheet-head">
        <h2>
          <Icon name="keyboard" /> Keyboard shortcuts
        </h2>
        <button type="button" className="icon-btn" aria-label="Close" onClick={() => setHelpOpen(false)}>
          <Icon name="x" />
        </button>
      </div>
      <dl className="kbd-list">
        {rows.map(([keys, desc]) => (
          <div key={desc}>
            <dt>
              {keys.map((k) => (
                <kbd key={k}>{k}</kbd>
              ))}
            </dt>
            <dd>{desc}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}
