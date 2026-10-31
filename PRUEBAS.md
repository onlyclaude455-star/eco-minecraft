# Lista de pruebas: ECO v2.1.0

Marca cada casilla cuando la pruebes y anota lo que veas. Antes de empezar, borra cualquier versión vieja de ECO (mira LEEME.md).

## Carga
- [ ] Al entrar al mundo, ¿se cargan los **dos** paquetes? ¿Sale algún error en pantalla?
- [ ] `/scriptevent eco:estado` responde con "ECO v2.1.0".

## Entidades (de noche: `/scriptevent eco:noche`)
- [ ] **Modelo:** ¿se ven El Testigo y El Imitador con cuerpo, sangre y sonrisa? ¿O salen invisibles, en negro o como un cubo morado y negro?
- [ ] **Ojos:** ¿las pupilas brillan, o se ven agujeros transparentes?
- [ ] **Dentro de casa:** ¿se agachan para caber bajo el techo?
- [ ] `eco:testigo detras`, `eco:testigo acecho`, `eco:testigo caza`, `eco:imitador`: ¿se comportan como dice LEEME.md?

## Sustos nuevos (`/scriptevent eco:evento <nombre>`)
- [ ] `apagon` cerca de antorchas: ¿se apagan de lejos a cerca con la voz "estoy aquí" saliendo de cada una?
- [ ] `asomarse` dentro de casa: ¿se inclina **hacia fuera** de la pared y se le ve la cabeza? ¿O se inclina hacia el lado contrario y queda tapado? (Si pasa esto último, dímelo: es un cambio de una línea.)
- [ ] `camara_giro`: ¿la cámara gira sola hasta El Testigo? ¿Recuperas el control después?
- [ ] `parpadeo`: ¿llegas a verlo durante ese instante? (Si no se ve nada, lo alargo un poco.)
- [ ] `golpes_puerta` (con una puerta cerca): ¿se oyen los golpes, se abre la puerta y hay algo detrás?
- [ ] `ventana` (dentro, con vidrio cerca): ¿aparece una cara fuera?
- [ ] `formulario`: ¿sale la ventana "¿Estás solo?"?
- [ ] `rayo` y `circulo` al aire libre.
- [ ] Intenta dormir de noche (desde la fase 2): ¿te despierta?

## De día
- [ ] `regalo` y `animal_muerto` (cerca de animales de granja).

## Luna roja (`/scriptevent eco:luna`)
- [ ] ¿Sale el título, la niebla roja, la lluvia de sangre y la ceniza?
- [ ] ¿Se apagan las luces y se abren las puertas?
- [ ] ¿Da miedo de verdad o hay algo que se repite demasiado?

## Prueba real (sin comandos)
- [ ] `/scriptevent eco:reiniciar` y jugar la **noche 1** completa, mejor con amigos y con auriculares.
- [ ] Jugar hasta la noche 5 (luna roja), o usar `eco:fase 4`.

## Notas de la prueba
-
