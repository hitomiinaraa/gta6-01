// EMBER TIDE — Cinder Cove. config.js
// All tuning, names, story data and static tables for the game.
// Nothing here is copied from any other game: city, people, brands and
// story are original fiction written for this entry.
(function () {
  'use strict';
  window.EMBER = window.EMBER || {};

  var CFG = {
    gameTitle: 'EMBER TIDE',
    gameSubtitle: 'Cinder Cove',
    cityName: 'Cinder Cove',
    seed: 20261124,
    // City layout
    pitch: 60,          // block + road, metres
    blockSize: 46,
    roadHalf: 7,
    gridN: 11,          // road lines 0..10 -> -300..+300
    worldHalf: 340,
    // Time: golden hour dusk, clock starts 18:42
    startMinutes: 18 * 60 + 42,
    dayLengthSec: 480,  // full day/night cycle in seconds of play
    // Player
    walkSpeed: 5.2,
    runSpeed: 9.5,
    sprintSpeed: 12.5,
    jumpSpeed: 7.5,
    playerRadius: 0.55,
    playerHealth: 100,
    playerArmor: 100,
    // Cars
    carMaxSpeed: { sedan: 34, sports: 48, suv: 32, truck: 28, bus: 24, police: 44, bike: 46, taxi: 34 },
    // Wanted
    maxWanted: 5,
    wantedDecaySec: 14,
    // Counts (caps for performance)
    maxTraffic: 26,
    maxPeds: 42,
    maxPolice: 10,
    // Graphics
    pixelRatioCap: 1.5,
    shadowSize: 2048,
  };

  var DISTRICTS = {
    downtown: { name: 'Downtown', center: [0, 0], radius: 150, minH: 30, maxH: 110, color: 0x8a7f8e },
    marina:    { name: 'Marina Row', center: [-210, 180], radius: 120, minH: 8, maxH: 26, color: 0xd98a6a },
    beach:     { name: 'Ember Beach', center: [0, 300], radius: 320, minH: 6, maxH: 18, color: 0xe8b48a },
    harbor:    { name: 'Harbor Yards', center: [-270, -60], radius: 110, minH: 10, maxH: 30, color: 0x7a8a94 },
    stadium:   { name: 'Stadium District', center: [240, -120], radius: 100, minH: 8, maxH: 22, color: 0x9a8a6a },
    park:      { name: 'Cinder Park', center: [-60, -210], radius: 90, minH: 4, maxH: 10, color: 0x6a8a5a },
    north:     { name: 'North Hills', center: [60, -240], radius: 130, minH: 6, maxH: 16, color: 0xb08a7a },
  };

  var CHARACTERS = {
    player:  { name: 'Rook Marlowe', role: 'Wheelman', color: '#ffcf5c', blurb: 'Ex-stunt driver. Owes Vesper one big favor.' },
    vesper:  { name: 'Vesper Kane', role: 'Fixer', color: '#e58ab8', blurb: 'Runs the Cove from a booth at the Dusk Diner.' },
    dizzy:   { name: 'Dizzy Okafor', role: 'Getaway Driver', color: '#7ad0ff', blurb: 'Never lost a tail. Never paid a ticket.' },
    mara:    { name: 'Mara Sol', role: 'Hacker', color: '#8affc1', blurb: 'Owns every camera in the Cove. Lends them out.' },
    hale:    { name: 'Corvin Hale', role: 'Harbor Boss', color: '#ff5c5c', blurb: 'Owns the docks. Wants the Cove. Wants Rook gone.' },
    officer: { name: 'Sgt. Reyes', role: 'CCPD', color: '#9ab8ff', blurb: 'Cinder Cove PD. Does not blink first.' },
  };

  // 8 chained story missions. Each: id, title, giver, brief, objective text,
  // target position (world x,z), kind, reward, time limit (0 = none).
  var MISSIONS = [
    { id: 1, title: 'Hot Wheels', giver: 'vesper', kind: 'steal',
      brief: 'Vesper needs a clean ride. Lift the ochre sports car parked on Marina Row and bring it to the Dusk Diner.',
      objective: 'Steal the sports car and deliver it to the diner', target: [-180, 180], reward: 400, timeLimit: 0 },
    { id: 2, title: 'Last Drop', giver: 'vesper', kind: 'deliver',
      brief: 'A package for the north hills. Drive it there before the harbor boys notice you are running.',
      objective: 'Deliver the package to North Hills', target: [120, -240], reward: 650, timeLimit: 150 },
    { id: 3, title: 'Tailspin', giver: 'dizzy', kind: 'chase',
      brief: 'Dizzy is being tailed by two of Hale\'s sedans. Catch them, run them off the road, and make it look like an accident.',
      objective: 'Wreck both tail cars', target: [60, 60], reward: 900, timeLimit: 0 },
    { id: 4, title: 'Drive-By Daylight', giver: 'mara', kind: 'shootout',
      brief: 'Hale\'s crew is holding the stadium lot. Mara jammed their radios. Take the lot, on foot, and leave no one standing.',
      objective: 'Clear the stadium lot gang (0/5)', target: [240, -60], reward: 1200, timeLimit: 0 },
    { id: 5, title: 'Rooftop Static', giver: 'mara', kind: 'shootout',
      brief: 'Mara\'s antenna is on the downtown tower roof. Hale\'s men got there first. Rooftop, dusk, no backup.',
      objective: 'Clear the rooftop gang (0/6)', target: [0, 0], reward: 1500, timeLimit: 0 },
    { id: 6, title: 'Cinder Heist', giver: 'vesper', kind: 'heist',
      brief: 'The Harbor Bank keeps its vault behind one sleepy guard. Get in, grab the cash, and do not be there when the sirens arrive.',
      objective: 'Grab the vault cash, then escape the bank', target: [-240, -60], reward: 3500, timeLimit: 0 },
    { id: 7, title: 'Ember Run', giver: 'dizzy', kind: 'escape',
      brief: 'Five stars, one helicopter, and a whole city between you and the tunnel. Lose them. All of them.',
      objective: 'Escape the police and reach the tunnel', target: [300, 240], reward: 2200, timeLimit: 0 },
    { id: 8, title: 'King of the Cove', giver: 'vesper', kind: 'finale',
      brief: 'Hale is at the marina with his whole crew. End it. Cinder Cove belongs to the people who built it.',
      objective: 'Defeat Corvin Hale and his crew (0/8)', target: [-210, 210], reward: 6000, timeLimit: 0 },
  ];

  var WEAPONS = {
    fists:  { name: 'Fists', slot: 1, damage: 12, rate: 2.2, range: 2.2, ammo: Infinity, auto: false, color: 0xffffff },
    pistol: { name: 'P9 Pistol', slot: 2, damage: 22, rate: 3.5, range: 55, ammo: 96, auto: false, color: 0xffd27a },
    smg:    { name: 'K-9 SMG', slot: 3, damage: 13, rate: 11, range: 42, ammo: 210, auto: true, color: 0xffe97a },
    shotgun:{ name: '12G Scatter', slot: 4, damage: 16, rate: 1.1, range: 26, ammo: 36, auto: false, pellets: 6, color: 0xff9a5c },
    rifle:  { name: 'AR-7 Carbine', slot: 5, damage: 30, rate: 6.5, range: 80, ammo: 150, auto: true, color: 0xff7a7a },
    grenade:{ name: 'Grenade', slot: 6, damage: 90, rate: 0.8, range: 30, ammo: 6, auto: false, color: 0x9aff7a },
  };

  var VEHICLE_TYPES = {
    sedan:  { name: 'Bantam Sedan', color: 0x4a6a9a, seats: 4, price: 1200 },
    sports: { name: 'Veloce GT', color: 0xd84a2a, seats: 2, price: 4200 },
    suv:    { name: 'Tundra SUV', color: 0x3a5a4a, seats: 5, price: 2400 },
    truck:  { name: 'Hauler Truck', color: 0x8a7a3a, seats: 2, price: 1800 },
    bus:    { name: 'Cove Bus', color: 0x2a7a8a, seats: 12, price: 3000 },
    police: { name: 'CCPD Interceptor', color: 0x1a2a4a, seats: 4, price: 0 },
    bike:   { name: 'Ember Bike', color: 0x9a2a6a, seats: 1, price: 2600 },
    taxi:   { name: 'Cove Cab', color: 0xd8b82a, seats: 4, price: 1400 },
  };

  var RADIO = [
    { name: 'EMBER FM 94.1', genre: 'Sunset Synth', track: 'Neon Tide - Glass Harbor' },
    { name: 'COVE ROCK 101.3', genre: 'Desert Rock', track: 'Dustline - The Breakers' },
    { name: 'WAVE 88.7', genre: 'Lo-Fi Dusk', track: 'Palm Static - Night Bus' },
    { name: 'TALK COVE 720', genre: 'Talk', track: 'The Dusk Report with Lena Voss' },
  ];

  var TIPS = [
    'Hold SHIFT to sprint. Press F near a car to steal it.',
    'Stealing a car in front of police raises your wanted level.',
    'Press M for the full map. Click anywhere to set a GPS waypoint.',
    'Press 1-6 to switch weapons. R reloads. Hold right mouse to aim.',
    'Lose the cops by leaving the red search circle, then stay hidden.',
    'Hold R to flip your car back over. Press H to honk.',
    'Taxi jobs and street races pay fast cash. Look for the gold markers.',
    'Collect the glowing ember tokens hidden around Cinder Cove.',
  ];

  window.EMBER.CFG = CFG;
  window.EMBER.DISTRICTS = DISTRICTS;
  window.EMBER.CHARACTERS = CHARACTERS;
  window.EMBER.MISSIONS = MISSIONS;
  window.EMBER.WEAPONS = WEAPONS;
  window.EMBER.VEHICLE_TYPES = VEHICLE_TYPES;
  window.EMBER.RADIO = RADIO;
  window.EMBER.TIPS = TIPS;
})();
