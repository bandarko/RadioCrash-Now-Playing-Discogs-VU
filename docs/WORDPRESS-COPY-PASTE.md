# Radio Crash — kompletni copy/paste JS i CSS

Pripremljene su dvije kompletne datoteke. Nemoj kombinirati kod iz poruke ili dodavati dijelove ručno.

## JavaScript

WordPress lokacija:

**Custom CSS & JS → All Custom Code → `JS 1 za Svira sada + Discogs + VU`**

1. Otvori postojeći zapis.
2. Napravi sigurnosnu kopiju njegova trenutačnog sadržaja.
3. Označi cijeli sadržaj zapisa.
4. Zamijeni ga cijelim sadržajem datoteke `now-playing-discogs-vu.js`.
5. Spremi zapis.

JavaScript sadrži postojeći Now Playing/Discogs dio i **hybrid real VU v3.3 Safari live-match**:

- Chrome, Firefox i Brave analiziraju isključivo audio element postojećeg SoundManager2 playera.
- Safari otvara `EventSource` prema `https://live.radiocrash.net/vu/events` i prima samo stvarne brojčane L/R razine.
- Ne postoji dodatni `new Audio()`, dodatni audio `src` ni poziv `play()`/`pause()`.
- EventSource je otvoren samo dok glavni player svira i zatvara se na Stop.
- Safari čeka stvarni `playing` događaj; VU zato ne kreće tijekom sporog učitavanja streama.
- Safari dBFS pretvara istom RMS formulom i gainom `24` kao Chrome/Firefox/Brave.
- Safari feed radi na 60 mjerenja/s, koristi isti kratki prozor od 256 uzoraka kao Chrome i serverski pomak od 1,5 s.
- Safari crta svaku pristiglu stvarnu SSE razinu izravno; to se na produkcijskoj stranici pokazalo življim od naknadno iskušanog `requestAnimationFrame` raspoređivanja.
- Stop stvarno radi `unload()` postojećeg SoundManager streama, pa sljedeći Play ne nastavlja stari AAC buffer.
- Napad LED-ica je trenutačan kao u Chromeu; decay se primjenjuje samo pri padu.
- LED DOM se mijenja samo kada se stvarno promijeni broj upaljenih segmenata.
- Na ekranima do 900 px VU se ne inicijalizira.

## CSS

WordPress lokacija:

**Custom CSS & JS → All Custom Code → `CSS 1 za Svira sada + Discogs + logo lijevo + VU`**

1. Otvori postojeći zapis.
2. Napravi sigurnosnu kopiju njegova trenutačnog sadržaja.
3. Označi cijeli sadržaj zapisa.
4. Zamijeni ga cijelim sadržajem datoteke `now-playing-discogs-vu.css`.
5. Spremi zapis.

CSS je funkcionalno jednak pronađenoj produkcijskoj verziji; dodano je samo dokumentacijsko zaglavlje. Izgled VU-a zato se ne bi trebao promijeniti.

Za Safari doradu CSS funkcionalno nije promijenjen; datoteka ostaje ovdje kao dokumentirana puna kopija.

## Nakon spremanja

Napravi hard refresh prije prvog testa.

Provjeri na desktop Safariju:

1. Play — VU prati stvarnu glazbu.
2. Stop pa Play — VU se ponovno pokreće.
3. Mute/Unmute — VU nastavlja pratiti dolazni signal.
4. Promijeni karticu pa se vrati — zvuk i VU se oporavljaju.
5. U Network panelu postoji samo jedan aktivan audio stream; `/vu/events` je mali tekstualni SSE feed, nije audio.

Ponovi Play/Stop provjeru na Chromeu, Firefoxu i Braveu. Na uređajima/viewportu do 900 px VU se ne inicijalizira.

Izolirani test u stvarnom Safariju 26.6.2 potvrdio je `server-safari` način i 5/5 uzastopnih Stop/Play ciklusa: pet SSE veza, stvarne odvojene L/R razine, pet zatvaranja starog streama, bez greške te povratak na 0/0 nakon svakog Stop.

Server v3.3 s 60 mjerenja/s i 256-frame analizom uključen je 24. 9. 2026. WordPress JS v3.3 također je potvrđen na produkciji. Kratko iskušana v3.4 frame-sync varijanta odbačena je jer je na stvarnoj Safari stranici izgledala tromije.
