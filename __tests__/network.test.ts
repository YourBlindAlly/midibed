// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs');
import { defaultState, migrateState } from '../src/config';
import { PREROLLS, defaultNetwork, networkJson } from '../src/network';

describe('the live link to a recording program', () => {
  it('is off by default, global, and saved settings gain it', () => {
    expect(defaultNetwork.on).toBe(false);
    expect(defaultNetwork.record).toBe(false);
    expect(defaultNetwork.channel).toBe(15); // MIDI channel 16, which no part uses
    const old: any = JSON.parse(JSON.stringify(defaultState));
    delete old.network;
    expect(migrateState(old).network).toEqual(defaultNetwork);
  });

  it('sends the engine plain numbers, kept in range', () => {
    const j = JSON.parse(networkJson({ ...defaultNetwork, on: true, record: true, channel: 40, startCC: 300, stopCC: -2, preroll: 5 }));
    expect(j).toEqual({ enabled: true, record: true, channel: 15, startCC: 127, stopCC: 0, prerollMs: 0, prerollBeats: 4 });
    expect(PREROLLS[0].ms + PREROLLS[0].beats).toBe(0);
  });

  it('the engine sends channel messages to the session once, never the loop app or clock messages, and signals around Play and Stop', () => {
    const e = fs.readFileSync('modules/midibed-engine/ios/MidiBedEngine.swift', 'utf8');
    expect(e).toContain('MIDIOutputPortCreate(client, "MidiBed Network Out"');
    expect(e).toContain('network.enabled && status < 0xF0 && ports.contains(where: { $0 != 1 })');
    expect(e).toContain('MIDINetworkSession.default().destinationEndpoint()');
    expect(e).toContain('self.sendReaperSignal(start: true)');
    expect(e).toContain('if self.reaperRecording { self.sendReaperSignal(start: false) }');
    // the music waits a whole number of clock pulses so the idle clock keeps its spacing
    expect(e).toContain('(wait / pulse).rounded() * pulse');
    const m = fs.readFileSync('modules/midibed-engine/ios/MidiBedEngineModule.swift', 'utf8');
    for (const f of ['setNetwork', 'sendReaperSignal', 'networkInfo']) expect(m).toContain(`Function("${f}")`);
  });

  it('the Setup tab has the section', () => {
    const app = fs.readFileSync('App.tsx', 'utf8');
    expect(app).toContain('<Section title="Live link to a recording program">');
    expect(app).toContain('Tell the recording program to record when I press Play');
  });
});

describe('the local network permission for Network MIDI', () => {
  it('the app declares its local network use and the Apple MIDI service', () => {
    const cfg = fs.readFileSync('app.config.js', 'utf8');
    expect(cfg).toContain('NSLocalNetworkUsageDescription');
    expect(cfg).toContain("NSBonjourServices: ['_apple-midi._udp']");
  });
});
