<?php
// Solo LEE una copia de la base y muestra rastros de la partida del jugador 1. Uso: sudo php rescate_partida.php ARCHIVO.sqlite
$d = new PDO('sqlite:' . $argv[1]); $d->setAttribute(3, 2);
function q($d, $s) { try { return $d->query($s)->fetchAll(2); } catch (Exception $e) { echo 'ERR ' . $e->getMessage() . "\n"; return []; } }
echo "== Resumen por fecha (hora Ecuador) y aparato: dia y capitulo maximos alcanzados\n";
foreach (q($d, "SELECT date(t,'unixepoch','-5 hours') f, substr(instalacion,1,6) ap, count(*) n,
  max(CAST(json_extract(datos,'$.dia') AS INT)) dmax, min(CAST(json_extract(datos,'$.dia') AS INT)) dmin,
  max(CAST(json_extract(datos,'$.capitulo') AS INT)) cap, time(min(t),'unixepoch','-5 hours') desde, time(max(t),'unixepoch','-5 hours') hasta
  FROM eventos WHERE jugador_id=1 GROUP BY f, ap ORDER BY f, desde") as $r)
  echo "$r[f] aparato $r[ap]: $r[n] registros, dia $r[dmin]-$r[dmax], capitulo $r[cap], de $r[desde] a $r[hasta]\n";
echo "\n== Ultimos 25 registros de cualquier tipo\n";
foreach (q($d, "SELECT datetime(t,'unixepoch','-5 hours') f, substr(instalacion,1,6) ap, nombre, substr(datos,1,90) x FROM eventos WHERE jugador_id=1 ORDER BY t DESC LIMIT 25") as $r)
  echo "$r[f] $r[ap] $r[nombre] $r[x]\n";
