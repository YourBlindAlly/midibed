Pod::Spec.new do |s|
  s.name           = 'MidiBedEngine'
  s.version        = '1.0.0'
  s.summary        = 'MidiBed native MIDI engine'
  s.description    = 'CoreMIDI virtual source, look-ahead scheduler, and built-in test synth'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '16.4'
  }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
