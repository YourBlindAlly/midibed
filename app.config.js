// "MidiBed" is a placeholder name (Rusty hasn't picked a real one yet).
// Display name / bundle id are cheap to change: this app is sideloaded only.
module.exports = {
  expo: {
    name: 'MidiBed',
    slug: 'midibed-app',
    scheme: 'midibed',
    version: '1.0.0',
    orientation: 'portrait',
    userInterfaceStyle: 'dark',
    backgroundColor: '#000000',
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.rustyperez.midibed',
      buildNumber: process.env.BUILD_NUMBER || '1',
      infoPlist: {
        // Keeps the process (and its CoreMIDI scheduler) alive while AUM or a
        // synth app is in front. Works because the built-in synth's audio
        // engine keeps running (silent when muted) for the app's whole life.
        UIBackgroundModes: ['audio'],
        ITSAppUsesNonExemptEncryption: false,
        // Lets the Files app show MidiBed's folder, so recorded MIDI files can be picked up from there.
        UIFileSharingEnabled: true,
        // Network MIDI (the live link to a recording program) uses the local network. Since iOS 14 the app has to say so,
        // or the permission question may never be asked and the session cannot connect.
        NSLocalNetworkUsageDescription: 'MidiBed sends its MIDI to your computer over the local network, for recording.',
        NSBonjourServices: ['_apple-midi._udp'],
        LSSupportsOpeningDocumentsInPlace: true,
      },
    },
    web: {},
    plugins: [],
  },
};
