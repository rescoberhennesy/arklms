
export const TRACKS = [
  { value: 'ASSH', label: 'ASSH', name: 'Arts, Social Science, and Humanities' },
  { value: 'BE',   label: 'BE',   name: 'Business and Entrepreneurship' },
  { value: 'H&T',  label: 'H&T',  name: 'Hospitality and Tourism' },
  { value: 'ICT',  label: 'ICT',  name: 'ICT Support and Computer Programming' },
] as const

export type Track = (typeof TRACKS)[number]['value']