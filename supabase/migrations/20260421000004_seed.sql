-- Seed the four workers. Hourly rates are 0 by default — Alex updates via UI.
insert into workers (name, hourly_rate, active) values
  ('Alex',   0, true),
  ('Gavin',  0, true),
  ('Jerry',  0, true),
  ('Pierce', 0, true)
on conflict (name) do nothing;
