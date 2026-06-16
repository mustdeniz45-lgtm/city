"""
Gaziantep Kültür Yolu (Culture Path) — 53 sites along the official walking route.

Coordinates are curated to cluster around the actual historic walking route
(Şahinbey district, around Gaziantep Castle). Well-known landmarks have
near-precise coords; lesser-known hans/mosques are distributed along the
bazaar streets between the castle and the Mevlevihane.
"""

KULTUR_YOLU = [
    {"n": 1,  "tr": "25 Aralık Panorama Müzesi", "en": "Panorama Museum 25 December", "lat": 37.06248, "lng": 37.38108, "cat": "museum"},
    {"n": 2,  "tr": "Ali Nacar Camii",           "en": "Ali Nacar Mosque",             "lat": 37.06430, "lng": 37.37950, "cat": "historic"},
    {"n": 3,  "tr": "Kumandan Çeşmesi",          "en": "Commander Fountain",           "lat": 37.06480, "lng": 37.37960, "cat": "historic"},
    {"n": 4,  "tr": "Tarihi Kır Kahvesi",        "en": "Historical Rural Coffee House","lat": 37.06520, "lng": 37.38010, "cat": "restaurant"},
    {"n": 5,  "tr": "Naib Hamamı",               "en": "Naib Bath",                    "lat": 37.06318, "lng": 37.38149, "cat": "historic"},
    {"n": 6,  "tr": "14 Şehit Anıtı",            "en": "14 Martyrs Monument",          "lat": 37.06560, "lng": 37.38080, "cat": "historic"},
    {"n": 7,  "tr": "Butik Otel",                "en": "Boutique Hotel",               "lat": 37.06388, "lng": 37.37908, "cat": "restaurant"},
    {"n": 8,  "tr": "Şirvan Camii",              "en": "Şirvan Mosque",                "lat": 37.06310, "lng": 37.38080, "cat": "historic"},
    {"n": 9,  "tr": "Gaziantep Kalesi",          "en": "Gaziantep Castle",             "lat": 37.06440, "lng": 37.38220, "cat": "historic"},
    {"n": 10, "tr": "Tarihi Zeytin İşlik Alanı", "en": "Historical Olive Workshop",    "lat": 37.06405, "lng": 37.38240, "cat": "historic"},
    {"n": 11, "tr": "Turizm Danışma Şube Müd.",  "en": "Tourism Info Office",          "lat": 37.06467, "lng": 37.38198, "cat": "must-see"},
    {"n": 12, "tr": "Handaniye Camii",           "en": "Handaniye Mosque",             "lat": 37.06360, "lng": 37.38255, "cat": "historic"},
    {"n": 13, "tr": "Havra",                     "en": "Synagogue",                    "lat": 37.06280, "lng": 37.38215, "cat": "historic"},
    {"n": 14, "tr": "Emine Göğüş Mutfak Müzesi", "en": "Emine Göğüş Culinary Museum",  "lat": 37.06485, "lng": 37.38055, "cat": "museum"},
    {"n": 15, "tr": "Paşa Hamamı / Hamam Müzesi","en": "Pasha Bath / Bath Museum",     "lat": 37.06408, "lng": 37.38175, "cat": "museum"},
    {"n": 16, "tr": "Hışva Han",                 "en": "Hışva Inn",                    "lat": 37.06438, "lng": 37.38062, "cat": "historic"},
    {"n": 17, "tr": "Millet Hanı",               "en": "Millet Inn",                   "lat": 37.06410, "lng": 37.38040, "cat": "historic"},
    {"n": 18, "tr": "Büdeyri Han",               "en": "Büdeyri Inn",                  "lat": 37.06382, "lng": 37.38020, "cat": "historic"},
    {"n": 19, "tr": "Tahtani Camii",             "en": "Tahtani Mosque",               "lat": 37.06270, "lng": 37.38008, "cat": "historic"},
    {"n": 20, "tr": "Göymen Pazar Hamamı",       "en": "Göymen Bazaar Bath",           "lat": 37.06330, "lng": 37.37985, "cat": "historic"},
    {"n": 21, "tr": "Yeni Han",                  "en": "New Inn",                      "lat": 37.06352, "lng": 37.37960, "cat": "historic"},
    {"n": 22, "tr": "Yüzükçü Han",               "en": "Yüzükçü Inn",                  "lat": 37.06320, "lng": 37.37940, "cat": "historic"},
    {"n": 23, "tr": "Gümrük Han",                "en": "Customs Inn",                  "lat": 37.06290, "lng": 37.37915, "cat": "historic"},
    {"n": 24, "tr": "Karagöz Camii",             "en": "Karagöz Mosque",               "lat": 37.06245, "lng": 37.37945, "cat": "historic"},
    {"n": 25, "tr": "Anadolu Han",               "en": "Anadolu Inn",                  "lat": 37.06260, "lng": 37.37895, "cat": "historic"},
    {"n": 26, "tr": "Alaüddevle Camii",          "en": "Alaüddevle Mosque",            "lat": 37.06360, "lng": 37.37998, "cat": "historic"},
    {"n": 27, "tr": "Zincirli Bedesten",         "en": "Zincirli Bedesten",            "lat": 37.06298, "lng": 37.37888, "cat": "must-see"},
    {"n": 28, "tr": "Emir Ali Han",              "en": "Emir Ali Inn",                 "lat": 37.06275, "lng": 37.37865, "cat": "historic"},
    {"n": 29, "tr": "Bakırcılar Çarşısı",        "en": "Coppersmiths Bazaar",          "lat": 37.06390, "lng": 37.37910, "cat": "must-see"},
    {"n": 30, "tr": "Tütün Han",                 "en": "Tobacco Inn",                  "lat": 37.06250, "lng": 37.37830, "cat": "historic"},
    {"n": 31, "tr": "Kürkçü Han",                "en": "Kürkçü Inn",                   "lat": 37.06220, "lng": 37.37810, "cat": "historic"},
    {"n": 32, "tr": "Pürsefa Han",               "en": "Pürsefa Inn",                  "lat": 37.06195, "lng": 37.37835, "cat": "historic"},
    {"n": 33, "tr": "Büyük Buğday Pazarı",       "en": "Grand Wheat Market",           "lat": 37.06175, "lng": 37.37870, "cat": "must-see"},
    {"n": 34, "tr": "Boyacı Camii",              "en": "Boyacı Mosque",                "lat": 37.06280, "lng": 37.37920, "cat": "historic"},
    {"n": 35, "tr": "Tekke Camii",               "en": "Tekke Mosque",                 "lat": 37.06230, "lng": 37.37885, "cat": "historic"},
    {"n": 36, "tr": "Mevlevihane Müzesi",        "en": "Mevlevi Center Museum",        "lat": 37.06210, "lng": 37.37862, "cat": "museum"},
    {"n": 37, "tr": "Tahmis Kahvesi",            "en": "Tahmis Coffee House",          "lat": 37.06400, "lng": 37.37990, "cat": "restaurant"},
    {"n": 38, "tr": "Küçük Buğday Pazarı",       "en": "Tiny Wheat Market",            "lat": 37.06205, "lng": 37.37910, "cat": "must-see"},
    {"n": 39, "tr": "Mecidiye Han",              "en": "Mecidiye Inn",                 "lat": 37.06180, "lng": 37.37945, "cat": "historic"},
    {"n": 40, "tr": "Kemikli Bedesten",          "en": "Kemikli Bazaar",               "lat": 37.06250, "lng": 37.37935, "cat": "must-see"},
    {"n": 41, "tr": "Elmacı Pazarı",             "en": "Elmacı Bazaar",                "lat": 37.06195, "lng": 37.37985, "cat": "must-see"},
    {"n": 42, "tr": "Hacı Nasır Camii",          "en": "Hacı Nasır Mosque",            "lat": 37.06170, "lng": 37.38015, "cat": "historic"},
    {"n": 43, "tr": "Hacı Veli Camii",           "en": "Hacı Veli Mosque",             "lat": 37.06155, "lng": 37.38055, "cat": "historic"},
    {"n": 44, "tr": "Güven Han",                 "en": "Güven Inn",                    "lat": 37.06185, "lng": 37.38085, "cat": "historic"},
    {"n": 45, "tr": "Şahinbey Halk Kütüphanesi", "en": "Şahinbey Public Library",      "lat": 37.06225, "lng": 37.38110, "cat": "must-see"},
    {"n": 46, "tr": "Yemiş Han",                 "en": "Yemiş Inn",                    "lat": 37.06200, "lng": 37.38130, "cat": "historic"},
    {"n": 47, "tr": "Şire Han",                  "en": "Şire Inn",                     "lat": 37.06175, "lng": 37.38158, "cat": "historic"},
    {"n": 48, "tr": "Tuz Han",                   "en": "Salt Inn",                     "lat": 37.06210, "lng": 37.38188, "cat": "historic"},
    {"n": 49, "tr": "Pişirici Kasteli",          "en": "Pişirici Kastel",              "lat": 37.06255, "lng": 37.38165, "cat": "historic"},
    {"n": 50, "tr": "Şehreküstü Konakları",      "en": "Şehreküstü Mansions",          "lat": 37.06305, "lng": 37.38198, "cat": "historic"},
    {"n": 51, "tr": "Şeyh Fethullah Camii",      "en": "Sheikh Fethullah Mosque",      "lat": 37.06415, "lng": 37.38125, "cat": "historic"},
    {"n": 52, "tr": "Şeyh Hamamı",               "en": "Sheikh Bath",                  "lat": 37.06435, "lng": 37.38108, "cat": "historic"},
    {"n": 53, "tr": "Milli Mücadele Müzesi",     "en": "National Resistance Museum",   "lat": 37.06510, "lng": 37.38110, "cat": "museum"},
]

# Default placeholder image for sites without curated photography
KY_IMAGE_BY_CAT = {
    "museum":     "https://images.unsplash.com/photo-1564507592333-c60657eea523?w=600&q=70",
    "historic":   "https://images.unsplash.com/photo-1591019479261-1a103585c559?w=600&q=70",
    "must-see":   "https://images.unsplash.com/photo-1574586597013-29bd92dc1617?w=600&q=70",
    "restaurant": "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=600&q=70",
}
