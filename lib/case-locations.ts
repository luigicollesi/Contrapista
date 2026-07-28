export const CASE_LOCATIONS = [
  { key: "museum_clue", name: "Museu" },
  { key: "bar_clue", name: "Bar" },
  { key: "pharmacy_clue", name: "Farmacia" },
  { key: "pawn_shop_clue", name: "Loja de penhores" },
  { key: "theater_clue", name: "Teatro" },
  { key: "bank_clue", name: "Banco" },
  { key: "bookstore_clue", name: "Livraria" },
  { key: "locksmith_clue", name: "Chaveiro" },
  { key: "docks_clue", name: "Docas" },
  { key: "hotel_clue", name: "Hotel" },
  { key: "tobacconist_clue", name: "Tabacaria" },
  { key: "carriage_station_clue", name: "Estacao de carruagens" },
  { key: "scotland_yard_clue", name: "Scotland Yard" },
  { key: "park_clue", name: "Parque" },
] as const;

export type CaseLocationKey = (typeof CASE_LOCATIONS)[number]["key"];
