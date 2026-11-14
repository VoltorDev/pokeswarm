# Rangos del cuarto lote (generado por `node tools/nico/multiverso/lote4/rangos.js`)

Daño nominal = dmg × count ÷ cd. Alcance = speed × life (projectile, cone, nova), range (turret) o radius (el resto).
Cada ataque debe caer DENTRO de ambos rangos de su forma (check.js §24). Los cuerpo a cuerpo de los Pokémon ya llevan el +20 % de daño y +25 % de alcance.

| Forma | Ataques | Daño nominal | Alcance | Campos que usa |
|---|---|---|---|---|
| aura | 7 | 14.5–18 | 66–80 | cd, dmg, radius, slow |
| beam | 5 | 14.8–24 | 215–250 | cd, dmg, radius, slow, width |
| boomerang | 3 | 16.8–22.5 | 200–230 | cd, count, dmg, knock, radius, size, speed, spread |
| chain | 2 | 75.6–88.4 | 140–150 | cd, count, dmg, hex, radius |
| cone | 2 | 64.6–70 | 153–159.6 | arc, burn, cd, count, dmg, life, pierce, size, slow, speed |
| dash | 2 | 24–26.7 | 110–120 | cd, dmg, knock, radius, width |
| melee | 9 | 29.2–44 | 55–85 | arc, cd, dmg, knock, radius, slow |
| meteor | 3 | 48.6–60 | 40–54 | cd, count, dmg, knock, radius, slow |
| mine | 3 | 20–30 | 56–60 | cd, count, dmg, dur, poison, radius, slow |
| nova | 7 | 70–121.7 | 200–368 | burn, cd, count, dmg, homing, life, pierce, size, slow, speed |
| orbit | 3 | 140–215.4 | 62–74 | burn, cd, count, dmg, knock, radius, size, speed |
| projectile | 9 | 22.4–34.6 | 364–616 | burn, cd, count, dmg, homing, knock, life, pierce, poison, size, speed, spread |
| trail | 2 | 20–35.7 | 26–28 | burn, cd, dmg, dur, poison, radius |
| turret | 2 | 3.5–4.3 | 280–300 | burn, cd, count, dmg, dur, range, rate, size, speed |

## Potenciadores (buff): copia exacta de uno de estos (stat, amount, stacks, dur, cd)

| Como | stat | amount | stacks | dur | cd |
|---|---|---|---|---|---|
| Danza Espada | atk | 0.13 | 5 | 7 | 0.85 |
| Agilidad | spd | 0.1 | 5 | 7 | 0.85 |
| Fortaleza | def | 0.07 | 5 | 7 | 0.85 |
| Acua Aro | regen | 1.6 | 4 | 8 | 0.9 |
| Danza Dragón | atk | 0.11 | 5 | 7 | 0.7 |

## `vis` que el juego ya dibuja

- **proj**: arrow, ball, blob, bolt, bubble, claw, crescent, drop, fire, heart, impact, jaws, leaf, needle, note, ring, rock, shadow, shard, star, streak, web, wind
- **melee**: claw, feather, impact, jaws, vine
- **beam**: crescent, drop, fire, jaws, lightning, ring, shadow, shard, streak
- **aura**: bolt, bubble, fire, heart, note, ring, rock, shadow, star, wind
- **trail**: bubbles, dirt, drip, ember, spark, wisp
- **buff**: arrow, ball, bubble, drop, heart, jaws, ring
- **pal**: bug, dark, dragon, electric, fairy, fighting, fire, flying, ghost, grass, ground, ice, normal, poison, psychic, rock, steel, water

## Lo que pide una evolución (segundo elemento de `evo`)

- `hp` = Vigor
- `atk` = Potencia
- `spd` = Carrera
- `cd` = Reflejos
- `def` = Coraza
- `rgn` = Síntesis
- `mag` = Imán
- `xp` = Aprendizaje

## Personajes del Multiverso que ya hay

| N.º | Nombre | Tipos | Vida / velocidad / ataque |
|---|---|---|---|
| 10001 | Agumon | fire / dragon | 96 / 112 / ×1.14 |
| 10002 | Doom Slayer | fighting / steel | 104 / 116 / ×1.18 |
| 10003 | Cacodemonio | dark / electric | 126 / 92 / ×1.08 |
| 10004 | Kirby | normal / flying | 108 / 98 / ×1.12 |
| 10005 | Link | fairy / steel | 110 / 108 / ×1.12 |
| 10006 | Samus | steel / electric | 116 / 100 / ×1.1 |
| 10007 | Pac-Man | normal / electric | 92 / 118 / ×1.1 |
| 10008 | Blinky | ghost / dark | 100 / 110 / ×1.16 |
| 10009 | Drácula | dark / fire | 110 / 96 / ×1.2 |
| 10010 | Ojo de Cthulhu | psychic / ghost | 106 / 117 / ×1.07 |
| 10011 | Jefe Maestro | rock / fighting | 122 / 106 / ×1.11 |
| 10012 | Kratos | fighting / fire | 120 / 102 / ×1.16 |
| 10013 | Ash | normal | 104 / 112 / ×1.12 |
| 10014 | Ash (Johto) | normal | 108 / 108 / ×1.12 |
| 10015 | Ash (Hoenn) | normal | 100 / 116 / ×1.12 |

## Ejemplos reales por forma (de upstream, con su nominal y alcance)

### aura

- `{"id":"giga-drain","name":"Hierba Lazo","type":"grass","kind":"aura","cd":0.55,"dmg":9,"radius":76,"_nominal":16.4,"_alcance":76}`
- `{"id":"discharge","name":"Chispazo","type":"electric","kind":"aura","cd":0.45,"dmg":8,"radius":70,"_nominal":17.8,"_alcance":70}`
- `{"id":"bulldoze","name":"Terratemblor","type":"ground","kind":"aura","cd":0.7,"dmg":11,"radius":80,"slow":0.35,"_nominal":15.7,"_alcance":80}`
- `{"id":"bug-buzz","name":"Zumbido","type":"bug","kind":"aura","cd":0.45,"dmg":8,"radius":66,"_nominal":17.8,"_alcance":66}`

### beam

- `{"id":"hydro-pump","name":"Hidrobomba","type":"water","kind":"beam","cd":1.5,"dmg":29,"radius":250,"width":30,"_nominal":19.3,"_alcance":250}`
- `{"id":"psybeam","name":"Psicorrayo","type":"psychic","kind":"beam","cd":1.15,"dmg":17,"radius":215,"width":40,"_nominal":14.8,"_alcance":215}`
- `{"id":"ice-beam","name":"Rayo Hielo","type":"ice","kind":"beam","cd":1.1,"dmg":20,"radius":220,"width":30,"slow":0.7,"_nominal":18.2,"_alcance":220}`
- `{"id":"dragon-rage","name":"Furia Dragón","type":"dragon","kind":"beam","cd":1,"dmg":24,"radius":230,"width":34,"_nominal":24,"_alcance":230}`

### boomerang

- `{"id":"razor-leaf","name":"Hoja Afilada","type":"grass","kind":"boomerang","cd":0.9,"dmg":10,"speed":330,"count":2,"spread":0.5,"radius":210,"size":6,"_nominal":22.2,"_alcance":210}`
- `{"id":"bonemerang","name":"Huesomerang","type":"ground","kind":"boomerang","cd":0.95,"dmg":16,"speed":300,"count":1,"radius":230,"size":8,"knock":40,"_nominal":16.8,"_alcance":230}`
- `{"id":"psycho-cut","name":"Psicocorte","type":"psychic","kind":"boomerang","cd":0.8,"dmg":9,"speed":360,"count":2,"spread":0.6,"radius":200,"size":7,"_nominal":22.5,"_alcance":200}`

### chain

- `{"id":"thunderbolt","name":"Rayo","type":"electric","kind":"chain","cd":0.95,"dmg":21,"count":4,"radius":140,"_nominal":88.4,"_alcance":140}`
- `{"id":"hex","name":"Infortunio","type":"ghost","kind":"chain","cd":0.9,"dmg":17,"count":4,"radius":150,"hex":1.7,"_nominal":75.6,"_alcance":150}`

### cone

- `{"id":"flamethrower","name":"Lanzallamas","type":"fire","kind":"cone","cd":0.7,"dmg":7,"count":7,"arc":0.9,"speed":380,"life":0.42,"size":6,"pierce":1,"burn":1,"_nominal":70,"_alcance":159.6}`
- `{"id":"bubble-beam","name":"Rayo Burbuja","type":"water","kind":"cone","cd":0.65,"dmg":6,"count":7,"arc":1,"speed":340,"life":0.45,"size":6,"slow":0.3,"_nominal":64.6,"_alcance":153}`

### dash

- `{"id":"quick-attack","name":"Ataque Rápido","type":"normal","kind":"dash","cd":0.75,"dmg":20,"radius":110,"width":34,"knock":40,"_nominal":26.7,"_alcance":110}`
- `{"id":"aerial-ace","name":"Golpe Aéreo","type":"flying","kind":"dash","cd":0.75,"dmg":18,"radius":120,"width":40,"knock":60,"_nominal":24,"_alcance":120}`

### melee

- `{"id":"tackle","name":"Placaje","type":"normal","kind":"melee","cd":0.5,"dmg":16,"radius":60,"arc":2.13,"knock":90,"_nominal":32,"_alcance":60}`
- `{"id":"vine-whip","name":"Látigo Cepa","type":"grass","kind":"melee","cd":0.62,"dmg":19,"radius":85,"arc":1.63,"knock":60,"_nominal":30.6,"_alcance":85}`
- `{"id":"wing-attack","name":"Ataque Ala","type":"flying","kind":"melee","cd":0.55,"dmg":17,"radius":73,"arc":2.38,"knock":70,"_nominal":30.9,"_alcance":73}`
- `{"id":"body-slam","name":"Golpe Cuerpo","type":"normal","kind":"melee","cd":0.95,"dmg":36,"radius":58,"arc":2.75,"knock":140,"_nominal":37.9,"_alcance":58}`

### meteor

- `{"id":"rock-slide","name":"Avalancha","type":"rock","kind":"meteor","cd":1.3,"dmg":26,"count":3,"radius":46,"knock":50,"_nominal":60,"_alcance":46}`
- `{"id":"hail","name":"Granizo","type":"ice","kind":"meteor","cd":1.2,"dmg":18,"count":4,"radius":40,"slow":0.4,"_nominal":60,"_alcance":40}`
- `{"id":"meteor-mash","name":"Puño Meteoro","type":"steel","kind":"meteor","cd":1.4,"dmg":34,"count":2,"radius":54,"knock":80,"_nominal":48.6,"_alcance":54}`

### mine

- `{"id":"string-shot","name":"Disparo Demora","type":"bug","kind":"mine","cd":1.1,"dmg":14,"count":2,"radius":56,"dur":7,"slow":0.6,"_nominal":25.5,"_alcance":56}`
- `{"id":"spikes","name":"Púas","type":"ground","kind":"mine","cd":1.2,"dmg":18,"count":2,"radius":60,"dur":8,"_nominal":30,"_alcance":60}`
- `{"id":"toxic-spikes","name":"Púas Tóxicas","type":"poison","kind":"mine","cd":1.1,"dmg":11,"count":2,"radius":56,"dur":8,"poison":2,"_nominal":20,"_alcance":56}`

### nova

- `{"id":"heat-wave","name":"Onda Ígnea","type":"fire","kind":"nova","cd":1.25,"dmg":13,"speed":250,"count":10,"pierce":1,"life":1.1,"size":7,"burn":1,"_nominal":104,"_alcance":275}`
- `{"id":"bubble","name":"Burbuja","type":"water","kind":"nova","cd":1,"dmg":9,"speed":210,"count":8,"pierce":0,"life":1.3,"size":8,"slow":0.45,"_nominal":72,"_alcance":273}`
- `{"id":"psychic","name":"Psíquico","type":"psychic","kind":"nova","cd":1.35,"dmg":10,"speed":230,"count":12,"pierce":1,"life":1.6,"size":7,"homing":1,"_nominal":88.9,"_alcance":368}`
- `{"id":"mud-shot","name":"Disparo Lodo","type":"ground","kind":"nova","cd":1.1,"dmg":11,"speed":200,"count":7,"pierce":0,"life":1,"size":9,"slow":0.4,"_nominal":70,"_alcance":200}`

### orbit

- `{"id":"fire-spin","name":"Giro Fuego","type":"fire","kind":"orbit","cd":0.3,"dmg":14,"count":3,"radius":62,"speed":2.4,"size":9,"burn":1,"_nominal":140,"_alcance":62}`
- `{"id":"leaf-storm","name":"Tormenta Floral","type":"grass","kind":"orbit","cd":0.26,"dmg":14,"count":4,"radius":74,"speed":2.6,"size":8,"_nominal":215.4,"_alcance":74}`
- `{"id":"gust","name":"Tornado","type":"flying","kind":"orbit","cd":0.26,"dmg":13,"count":3,"radius":72,"speed":2.8,"size":8,"knock":40,"_nominal":150,"_alcance":72}`

### projectile

- `{"id":"ember","name":"Ascuas","type":"fire","kind":"projectile","cd":0.52,"dmg":18,"speed":310,"count":1,"spread":0.12,"pierce":0,"life":1.6,"size":7,"burn":1,"_nominal":34.6,"_alcance":496}`
- `{"id":"water-gun","name":"Pistola Agua","type":"water","kind":"projectile","cd":0.44,"dmg":14,"speed":350,"count":1,"spread":0.1,"pierce":1,"life":1.5,"size":6,"_nominal":31.8,"_alcance":525}`
- `{"id":"thunder-shock","name":"Impactrueno","type":"electric","kind":"projectile","cd":0.4,"dmg":13,"speed":480,"count":1,"spread":0.08,"pierce":2,"life":1.1,"size":5,"_nominal":32.5,"_alcance":528}`
- `{"id":"confusion","name":"Confusión","type":"psychic","kind":"projectile","cd":0.58,"dmg":13,"speed":280,"count":1,"spread":0.1,"pierce":0,"life":2.2,"size":8,"homing":2,"_nominal":22.4,"_alcance":616}`

### trail

- `{"id":"toxic","name":"Tóxico","type":"poison","kind":"trail","cd":0.3,"dmg":6,"radius":26,"dur":3,"poison":1,"_nominal":20,"_alcance":26}`
- `{"id":"flame-wheel","name":"Rueda Fuego","type":"fire","kind":"trail","cd":0.28,"dmg":10,"radius":28,"dur":2.6,"burn":1,"_nominal":35.7,"_alcance":28}`

### turret

- `{"id":"will-o-wisp","name":"Fuego Fatuo","type":"fire","kind":"turret","cd":3.5,"dmg":15,"rate":0.55,"dur":6,"count":1,"range":300,"speed":300,"size":7,"burn":1,"_nominal":4.3,"_alcance":300}`
- `{"id":"substitute","name":"Sustituto","type":"normal","kind":"turret","cd":4,"dmg":14,"rate":0.4,"dur":6,"count":1,"range":280,"speed":320,"size":6,"_nominal":3.5,"_alcance":280}`

