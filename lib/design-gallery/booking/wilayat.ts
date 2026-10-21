/** Oman's 61 wilayat by governorate, for the booking form's "Wilayat" list. */
export type Wilayat = { key: string; ar: string; en: string }
export type Governorate = { ar: string; en: string; wilayat: Wilayat[] }

const w = (key: string, ar: string, en: string): Wilayat => ({ key, ar, en })

export const OMAN_GOVERNORATES: Governorate[] = [
  {
    ar: "مسقط",
    en: "Muscat",
    wilayat: [
      w("muscat", "مسقط", "Muscat"),
      w("muttrah", "مطرح", "Muttrah"),
      w("bawshar", "بوشر", "Bawshar"),
      w("seeb", "السيب", "Al Seeb"),
      w("amerat", "العامرات", "Al Amerat"),
      w("qurayyat", "قريات", "Qurayyat"),
    ],
  },
  {
    ar: "ظفار",
    en: "Dhofar",
    wilayat: [
      w("salalah", "صلالة", "Salalah"),
      w("taqah", "طاقة", "Taqah"),
      w("mirbat", "مرباط", "Mirbat"),
      w("rakhyut", "رخيوت", "Rakhyut"),
      w("thumrait", "ثمريت", "Thumrait"),
      w("dhalkut", "ضلكوت", "Dhalkut"),
      w("mazyunah", "المزيونة", "Al Mazyunah"),
      w("muqshin", "مقشن", "Muqshin"),
      w("shalim", "شليم وجزر الحلانيات", "Shalim and the Hallaniyat Islands"),
      w("sadah", "سدح", "Sadah"),
    ],
  },
  {
    ar: "مسندم",
    en: "Musandam",
    wilayat: [w("khasab", "خصب", "Khasab"), w("daba", "دبا", "Daba"), w("bukha", "بخاء", "Bukha"), w("madha", "مدحاء", "Madha")],
  },
  {
    ar: "البريمي",
    en: "Al Buraimi",
    wilayat: [w("buraimi", "البريمي", "Al Buraimi"), w("mahdah", "محضة", "Mahdah"), w("sunaynah", "السنينة", "Al Sunaynah")],
  },
  {
    ar: "الداخلية",
    en: "Ad Dakhiliyah",
    wilayat: [
      w("nizwa", "نزوى", "Nizwa"),
      w("bahla", "بهلاء", "Bahla"),
      w("manah", "منح", "Manah"),
      w("hamra", "الحمراء", "Al Hamra"),
      w("adam", "أدم", "Adam"),
      w("izki", "إزكي", "Izki"),
      w("samail", "سمائل", "Samail"),
      w("bidbid", "بدبد", "Bidbid"),
    ],
  },
  {
    ar: "شمال الباطنة",
    en: "North Al Batinah",
    wilayat: [
      w("sohar", "صحار", "Sohar"),
      w("shinas", "شناص", "Shinas"),
      w("liwa", "لوى", "Liwa"),
      w("saham", "صحم", "Saham"),
      w("khaburah", "الخابورة", "Al Khaburah"),
      w("suwaiq", "السويق", "Al Suwaiq"),
    ],
  },
  {
    ar: "جنوب الباطنة",
    en: "South Al Batinah",
    wilayat: [
      w("rustaq", "الرستاق", "Al Rustaq"),
      w("awabi", "العوابي", "Al Awabi"),
      w("nakhal", "نخل", "Nakhal"),
      w("wadi-maawil", "وادي المعاول", "Wadi Al Maawil"),
      w("barka", "بركاء", "Barka"),
      w("musannah", "المصنعة", "Al Musannah"),
    ],
  },
  {
    ar: "جنوب الشرقية",
    en: "South Ash Sharqiyah",
    wilayat: [
      w("sur", "صور", "Sur"),
      w("kamil-wafi", "الكامل والوافي", "Al Kamil Wal Wafi"),
      w("jalan-bani-bu-hassan", "جعلان بني بو حسن", "Jalan Bani Bu Hassan"),
      w("jalan-bani-bu-ali", "جعلان بني بو علي", "Jalan Bani Bu Ali"),
      w("masirah", "مصيرة", "Masirah"),
    ],
  },
  {
    ar: "شمال الشرقية",
    en: "North Ash Sharqiyah",
    wilayat: [
      w("ibra", "إبراء", "Ibra"),
      w("mudhaibi", "المضيبي", "Al Mudhaibi"),
      w("bidiyah", "بدية", "Bidiyah"),
      w("qabil", "القابل", "Al Qabil"),
      w("wadi-bani-khalid", "وادي بني خالد", "Wadi Bani Khalid"),
      w("dima-taeen", "دماء والطائيين", "Dima Wa Al Taeen"),
    ],
  },
  {
    ar: "الظاهرة",
    en: "Ad Dhahirah",
    wilayat: [w("ibri", "عبري", "Ibri"), w("yanqul", "ينقل", "Yanqul"), w("dhank", "ضنك", "Dhank")],
  },
  {
    ar: "الوسطى",
    en: "Al Wusta",
    wilayat: [w("haima", "هيماء", "Haima"), w("duqm", "الدقم", "Duqm"), w("mahout", "محوت", "Mahout"), w("jazer", "الجازر", "Al Jazer")],
  },
]

export const OMAN_WILAYAT: Wilayat[] = OMAN_GOVERNORATES.flatMap((g) => g.wilayat)

export function findWilayat(key: string | null | undefined): Wilayat | null {
  return OMAN_WILAYAT.find((item) => item.key === key) ?? null
}
