#!/usr/bin/env python3
"""Otelsayfam iOS çevirileri: String Catalog dosyalarını (xcstrings) üretir.

Kaynak dil Türkçe; anahtar = Türkçe metin. Yeni metin eklenince:
  1. xcodebuild -exportLocalizations ile çıkan anahtarı aşağıya ekleyin,
  2. python3 scripts/translations.py çalıştırın.
Çevirisi olmayan anahtar Türkçe görünür; betik eksikleri listeler.

Çeviri biçimleri:
  ("en", "de", "ru")                      düz metin
  P(...)                                  tek sayılı çoğul (%lld)
  S("şablon", ad=(sıra, P(...)), ...)     birden çok değişkenli metinde çoğul parça
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
LANGS = ("en", "de", "ru")


class P:
    """Çoğul biçimler. en/de: (one, other); ru: (one, few, many)."""

    def __init__(self, en, de, ru):
        self.forms = {
            "en": {"one": en[0], "other": en[1]},
            "de": {"one": de[0], "other": de[1]},
            "ru": {"one": ru[0], "few": ru[1], "many": ru[2], "other": ru[2]},
        }


class S:
    """Şablon + adlandırılmış çoğul parçalar: %#@ad@ yer tutucusu."""

    def __init__(self, en, de, ru, **subs):
        self.templates = {"en": en, "de": de, "ru": ru}
        self.subs = subs


def unit(value):
    return {"stringUnit": {"state": "translated", "value": value}}


def plural(forms):
    return {"variations": {"plural": {k: unit(v) for k, v in forms.items()}}}


def localization(value, lang):
    if isinstance(value, P):
        return plural(value.forms[lang])
    if isinstance(value, S):
        out = unit(value.templates[lang])
        out["substitutions"] = {
            name: {"argNum": num, "formatSpecifier": "lld", **plural(p.forms[lang])}
            for name, (num, p) in value.subs.items()
        }
        return out
    return unit(value[LANGS.index(lang)])


NIGHT = P(("%arg night", "%arg nights"), ("%arg Nacht", "%arg Nächte"), ("%arg ночь", "%arg ночи", "%arg ночей"))
REVIEW = P(("%arg review", "%arg reviews"), ("%arg Bewertung", "%arg Bewertungen"), ("%arg отзыв", "%arg отзыва", "%arg отзывов"))

APP = {
    "%@ filtresini kaldır": ("Remove filter: %@", "Filter entfernen: %@", "Убрать фильтр: %@"),
    "%@ gönderildi": ("Sent %@", "Gesendet %@", "Отправлено %@"),
    "%@ haritada": ("%@ on the map", "%@ auf der Karte", "%@ на карте"),
    "%@ fotoğrafları": ("Photos of %@", "Fotos: %@", "Фотографии: %@"),
    "%@ konaklaması": ("Stayed in %@", "Aufenthalt: %@", "Проживание: %@"),
    "%@ tarihinden itibaren": ("from %@", "ab %@", "с %@"),
    "%@ · %lld yorum": S("%1$@ · %#@reviews@", "%1$@ · %#@reviews@", "%1$@ · %#@reviews@", reviews=(2, REVIEW)),
    "%@ – %@ · %lld gece": S("%1$@ – %2$@ · %#@nights@", "%1$@ – %2$@ · %#@nights@", "%1$@ – %2$@ · %#@nights@", nights=(3, NIGHT)),
    "%lld / %lld": ("%1$lld / %2$lld", "%1$lld / %2$lld", "%1$lld / %2$lld"),
    "%lld çocuk": P(("%lld child", "%lld children"), ("%lld Kind", "%lld Kinder"), ("%lld ребёнок", "%lld ребёнка", "%lld детей")),
    "%lld filtre": P(("%lld filter", "%lld filters"), ("%lld Filter", "%lld Filter"), ("%lld фильтр", "%lld фильтра", "%lld фильтров")),
    "%lld gece": P(("%lld night", "%lld nights"), ("%lld Nacht", "%lld Nächte"), ("%lld ночь", "%lld ночи", "%lld ночей")),
    "%lld gece toplam": P(("total for %lld night", "total for %lld nights"), ("gesamt für %lld Nacht", "gesamt für %lld Nächte"), ("всего за %lld ночь", "всего за %lld ночи", "всего за %lld ночей")),
    "%lld gece toplam (%lld gecesi ücretsiz) · ort. %@ / gece": S(
        "%#@nights@ total (%#@free@ free) · avg. %3$@ / night",
        "%#@nights@ gesamt (%#@free@ gratis) · Ø %3$@ / Nacht",
        "%#@nights@ всего (%#@free@ бесплатно) · в среднем %3$@ / ночь",
        nights=(1, NIGHT), free=(2, NIGHT)),
    "%lld gece toplam · ort. %@ / gece": S(
        "%#@nights@ total · avg. %2$@ / night",
        "%#@nights@ gesamt · Ø %2$@ / Nacht",
        "%#@nights@ всего · в среднем %2$@ / ночь",
        nights=(1, NIGHT)),
    "%lld gece toplam, başlayan": P(("from, total for %lld night", "from, total for %lld nights"), ("ab, gesamt für %lld Nacht", "ab, gesamt für %lld Nächte"), ("от, всего за %lld ночь", "от, всего за %lld ночи", "от, всего за %lld ночей")),
    "%lld geceden uzun konaklamalar için fiyatı ekibimiz bildirir; talep gönderin.": (
        "For stays longer than %lld nights our team quotes the price; please send a request.",
        "Für Aufenthalte über %lld Nächte nennt unser Team den Preis; bitte senden Sie eine Anfrage.",
        "Для проживания дольше %lld ночей цену сообщит наша команда; отправьте запрос."),
    "%lld kış oteli yayında": P(("%lld winter hotel listed", "%lld winter hotels listed"), ("%lld Winterhotel online", "%lld Winterhotels online"), ("%lld зимний отель в каталоге", "%lld зимних отеля в каталоге", "%lld зимних отелей в каталоге")),
    "%lld m²": ("%lld m²", "%lld m²", "%lld м²"),
    "%lld oda tipi": P(("%lld room type", "%lld room types"), ("%lld Zimmertyp", "%lld Zimmertypen"), ("%lld тип номеров", "%lld типа номеров", "%lld типов номеров")),
    "%lld olanağın tümünü gör": ("See all %lld amenities", "Alle %lld Ausstattungen ansehen", "Все удобства (%lld)"),
    "%lld olanak": P(("%lld amenity", "%lld amenities"), ("%lld Ausstattung", "%lld Ausstattungen"), ("%lld удобство", "%lld удобства", "%lld удобств")),
    "%lld otel uygun": P(("%lld hotel available", "%lld hotels available"), ("%lld Hotel verfügbar", "%lld Hotels verfügbar"), ("%lld отель подходит", "%lld отеля подходят", "%lld отелей подходят")),
    "%lld otel yayında": P(("%lld hotel listed", "%lld hotels listed"), ("%lld Hotel online", "%lld Hotels online"), ("%lld отель в каталоге", "%lld отеля в каталоге", "%lld отелей в каталоге")),
    "%lld sonuç": P(("%lld result", "%lld results"), ("%lld Ergebnis", "%lld Ergebnisse"), ("%lld результат", "%lld результата", "%lld результатов")),
    "%lld termal otel yayında": P(("%lld thermal hotel listed", "%lld thermal hotels listed"), ("%lld Thermalhotel online", "%lld Thermalhotels online"), ("%lld термальный отель в каталоге", "%lld термальных отеля в каталоге", "%lld термальных отелей в каталоге")),
    "%lld yaş": P(("%lld year old", "%lld years old"), ("%lld Jahr", "%lld Jahre"), ("%lld год", "%lld года", "%lld лет")),
    "%lld yetişkin": P(("%lld adult", "%lld adults"), ("%lld Erwachsener", "%lld Erwachsene"), ("%lld взрослый", "%lld взрослых", "%lld взрослых")),
    "%lld yorum": P(("%lld review", "%lld reviews"), ("%lld Bewertung", "%lld Bewertungen"), ("%lld отзыв", "%lld отзыва", "%lld отзывов")),
    "%lld yıldızlı": ("%lld-star", "%lld Sterne", "%lld★"),
    "%lld. çocuğun yaşı": ("Age of child %lld", "Alter von Kind %lld", "Возраст ребёнка %lld"),
    "1 yaşından küçük": ("Under 1 year", "Unter 1 Jahr", "Младше 1 года"),
    "3.000 ₺ altı": ("Under ₺3,000", "Unter 3.000 ₺", "До 3 000 ₺"),
    "3.000–8.000 ₺": ("₺3,000–8,000", "3.000–8.000 ₺", "3 000–8 000 ₺"),
    "5 üzerinden %@, %lld yorum": S("%1$@ out of 5, %#@reviews@", "%1$@ von 5, %#@reviews@", "%1$@ из 5, %#@reviews@", reviews=(2, REVIEW)),
    "5 üzerinden %lld": ("%lld out of 5", "%lld von 5", "%lld из 5"),
    "8.000 ₺ üstü": ("Over ₺8,000", "Über 8.000 ₺", "От 8 000 ₺"),
    "Açık havuz": ("Outdoor pool", "Außenpool", "Открытый бассейн"),
    "Ad Soyad": ("Full name", "Vor- und Nachname", "Имя и фамилия"),
    "Adınızı yazın.": ("Enter your name.", "Geben Sie Ihren Namen ein.", "Введите имя."),
    "Anında, kaynağı gösterilen cevap": ("Instant answers with the source shown", "Sofortige Antwort mit Quellenangabe", "Мгновенный ответ с указанием источника"),
    "Ara": ("Search", "Suche", "Поиск"),
    "Aradığınız kayıt bulunamadı.": ("We couldn’t find what you were looking for.", "Der gesuchte Eintrag wurde nicht gefunden.", "Запись не найдена."),
    "Aramadan tura, her adımda yanınızda bir rehber": ("A guide by your side at every step, from search to tour", "Von der Suche bis zur Tour: ein Guide an Ihrer Seite", "Гид рядом на каждом шаге: от поиска до тура"),
    "Bağlantı yok": ("No connection", "Keine Verbindung", "Нет соединения"),
    "Beğendiğiniz otelde kalp simgesine dokunun; burada toplanır. Gönderdiğiniz talepler ve baktığınız oteller de burada listelenir.": (
        "Tap the heart on a hotel you like and it is kept here. Requests you send and hotels you viewed are listed here too.",
        "Tippen Sie bei einem Hotel auf das Herz, dann wird es hier gesammelt. Ihre Anfragen und zuletzt angesehene Hotels stehen ebenfalls hier.",
        "Нажмите на сердечко у понравившегося отеля, и он появится здесь. Отправленные запросы и просмотренные отели тоже будут здесь."),
    "Beklenmeyen bir hata oluştu (%lld).": ("Something went wrong (%lld).", "Ein unerwarteter Fehler ist aufgetreten (%lld).", "Произошла непредвиденная ошибка (%lld)."),
    "Bildirim açılamadı; cevap e-postanıza gelecek.": ("Notifications couldn’t be turned on; the reply will come by email.", "Mitteilungen konnten nicht aktiviert werden; die Antwort kommt per E-Mail.", "Не удалось включить уведомления; ответ придёт на почту."),
    "Bildirim izni kapalı. Ayarlar > Otelsayfam > Bildirimler'den açabilirsiniz.": ("Notifications are off. Turn them on in Settings > Otelsayfam > Notifications.", "Mitteilungen sind aus. Aktivieren Sie sie unter Einstellungen > Otelsayfam > Mitteilungen.", "Уведомления выключены. Включите их в Настройки > Otelsayfam > Уведомления."),
    "Bildirim izni kapalı. Ayarlar > Otelsayfam > Bildirimler'den açabilirsiniz; cevap e-postanıza da gelir.": ("Notifications are off. Turn them on in Settings > Otelsayfam > Notifications; the reply also comes by email.", "Mitteilungen sind aus. Aktivieren Sie sie unter Einstellungen > Otelsayfam > Mitteilungen; die Antwort kommt auch per E-Mail.", "Уведомления выключены. Включите их в Настройки > Otelsayfam > Уведомления; ответ также придёт на почту."),
    "Bildirim kaydı yapılamadı.": ("Couldn’t register for notifications.", "Die Registrierung für Mitteilungen ist fehlgeschlagen.", "Не удалось подписаться на уведомления."),
    "Bildirim şu an açılamadı. Bağlantınızı kontrol edip tekrar deneyin.": ("Notifications couldn’t be turned on right now. Check your connection and try again.", "Mitteilungen konnten gerade nicht aktiviert werden. Prüfen Sie Ihre Verbindung und versuchen Sie es erneut.", "Сейчас не удалось включить уведомления. Проверьте соединение и повторите попытку."),
    "Bu adımın videosu bulunamadı.": ("The video for this stop wasn’t found.", "Das Video zu dieser Station wurde nicht gefunden.", "Видео для этой остановки не найдено."),
    "Bu cihazda Türkçe konuşma tanıma şu an kullanılamıyor.": ("Turkish speech recognition isn’t available on this device right now.", "Die türkische Spracherkennung ist auf diesem Gerät derzeit nicht verfügbar.", "Распознавание турецкой речи сейчас недоступно на этом устройстве."),
    "Bu konuda doğrulanmış bilgim yok.": ("I don’t have verified information on that.", "Dazu habe ich keine bestätigten Informationen.", "У меня нет проверенной информации об этом."),
    "Bu oda %@ alır; seçtiğiniz kişi sayısı için uygun değil.": ("This room takes %@; it doesn’t fit the number of guests you selected.", "Dieses Zimmer ist für %@; es passt nicht zur gewählten Personenzahl.", "Этот номер рассчитан на %@ и не подходит для выбранного числа гостей."),
    "Bu odanın fiyatı henüz girilmemiş. Talep gönderin, ekibimiz fiyatı size bildirsin.": ("This room has no price yet. Send a request and our team will get back to you with the price.", "Für dieses Zimmer ist noch kein Preis hinterlegt. Senden Sie eine Anfrage, unser Team nennt Ihnen den Preis.", "Цена этого номера пока не указана. Отправьте запрос, и наша команда сообщит цену."),
    "Bu otel": ("This hotel", "Dieses Hotel", "Этот отель"),
    "Bu otelin oda fiyatları henüz girilmemiş. Talep gönderin, ekibimiz fiyatı size bildirsin.": ("This hotel has no room prices yet. Send a request and our team will get back to you with the price.", "Für dieses Hotel sind noch keine Zimmerpreise hinterlegt. Senden Sie eine Anfrage, unser Team nennt Ihnen den Preis.", "Цены на номера этого отеля пока не указаны. Отправьте запрос, и наша команда сообщит цену."),
    "Bu sezonda otel yok": ("No hotels this season", "Keine Hotels in dieser Saison", "В этом сезоне отелей нет"),
    "Bu soruya şu an cevap veremedim. Dilerseniz sorunuzu ekibimize iletebilirsiniz.": ("I couldn’t answer that right now. You can pass your question on to our team.", "Diese Frage konnte ich gerade nicht beantworten. Sie können sie an unser Team weiterleiten.", "Сейчас я не смог ответить на этот вопрос. Вы можете передать его нашей команде."),
    "Bu talep ve (isteğe bağlı) gelecek teklifler için benimle iletişime geçilmesini kabul ediyorum": ("I agree to be contacted about this request and (optionally) future offers", "Ich bin einverstanden, zu dieser Anfrage und (optional) künftigen Angeboten kontaktiert zu werden", "Я согласен, чтобы со мной связались по этому запросу и (по желанию) будущим предложениям"),
    "Bu tarihlerde en az %lld gece konaklama gerekiyor.": ("These dates require a stay of at least %lld nights.", "Für diese Daten gilt ein Mindestaufenthalt von %lld Nächten.", "На эти даты минимальный срок проживания: %lld ноч."),
    "Büyüklük": ("Size", "Größe", "Площадь"),
    "Cevap e-postanıza gelecek": ("The reply will come by email", "Die Antwort kommt per E-Mail", "Ответ придёт на почту"),
    "Cevap gelince bildirim al": ("Notify me when there’s a reply", "Bei Antwort benachrichtigen", "Уведомить об ответе"),
    "Cevap gelince bildirim alacaksınız.": ("You’ll be notified when there’s a reply.", "Sie werden benachrichtigt, sobald eine Antwort da ist.", "Вы получите уведомление, когда придёт ответ."),
    "Cevaplar %@ için girilen bilgilerden gelir. Bilgi yoksa uydurmaz; sorunuzu ekibimize iletmenizi önerir.": ("Answers come from the information entered for %@. If there is none, the guide doesn’t make things up; it suggests passing your question to our team.", "Die Antworten stammen aus den für %@ hinterlegten Angaben. Fehlt eine Angabe, erfindet der Guide nichts, sondern empfiehlt, die Frage an unser Team weiterzuleiten.", "Ответы основаны на сведениях, внесённых для %@. Если сведений нет, гид ничего не выдумывает и предлагает передать вопрос нашей команде."),
    "Çevrimdışısınız. Son kaydedilen bilgiler gösteriliyor; fiyatlar değişmiş olabilir.": ("You’re offline. Showing the last saved information; prices may have changed.", "Sie sind offline. Angezeigt werden die zuletzt gespeicherten Daten; Preise können sich geändert haben.", "Вы не в сети. Показаны последние сохранённые данные; цены могли измениться."),
    "Çocuk": ("Children", "Kinder", "Дети"),
    "Çocuk kapasitesi ekibimizce teyit edilir.": ("Child capacity is confirmed by our team.", "Die Kinderkapazität wird von unserem Team bestätigt.", "Размещение детей подтверждает наша команда."),
    "Çocuk ücreti yaşa göre hesaplanır.": ("Child rates depend on age.", "Der Kinderpreis richtet sich nach dem Alter.", "Стоимость для детей зависит от возраста."),
    "Çocuk: %lld": ("Children: %lld", "Kinder: %lld", "Дети: %lld"),
    "Çok fazla soru sordunuz, biraz sonra tekrar deneyin.": ("Too many questions; please try again in a moment.", "Zu viele Fragen; bitte versuchen Sie es gleich noch einmal.", "Слишком много вопросов; попробуйте чуть позже."),
    "Çok fazla talep gönderdiniz, biraz sonra tekrar deneyin.": ("Too many requests; please try again in a moment.", "Zu viele Anfragen; bitte versuchen Sie es gleich noch einmal.", "Слишком много запросов; попробуйте чуть позже."),
    "Çıkış": ("Check-out", "Abreise", "Выезд"),
    "Çıkış tarihi girişten sonra olmalı.": ("Check-out must be after check-in.", "Die Abreise muss nach der Anreise liegen.", "Дата выезда должна быть позже даты заезда."),
    "Daha az göster": ("Show less", "Weniger anzeigen", "Свернуть"),
    "Devam": ("Continue", "Weiter", "Далее"),
    "Devamını oku": ("Read more", "Weiterlesen", "Читать далее"),
    "Diğer siteler fotoğraf gösterir. Biz oteli gezdiririz.": ("Other sites show photos. We walk you through the hotel.", "Andere Seiten zeigen Fotos. Wir führen Sie durchs Hotel.", "Другие сайты показывают фото. Мы проводим вас по отелю."),
    "Dinlemeyi bitir ve gönder": ("Stop listening and send", "Zuhören beenden und senden", "Закончить запись и отправить"),
    "Dinliyorum…": ("Listening…", "Ich höre zu…", "Слушаю…"),
    "Durak %lld / %lld": ("Stop %1$lld / %2$lld", "Station %1$lld / %2$lld", "Остановка %1$lld / %2$lld"),
    "Duraklı video tur": ("Video tour with stops", "Videotour mit Stationen", "Видеотур с остановками"),
    "Durdur": ("Stop", "Stopp", "Стоп"),
    "E-posta": ("Email", "E-Mail", "Эл. почта"),
    "Ekibimiz %@ için talebinizi inceleyip %@ adresine dönüş yapacak. Talebiniz Kaydedilenler sekmesinde de duruyor.": (
        "Our team will review your request for %1$@ and reply to %2$@. Your request is also kept in the Saved tab.",
        "Unser Team prüft Ihre Anfrage für %1$@ und antwortet an %2$@. Ihre Anfrage finden Sie auch im Tab „Gespeichert“.",
        "Наша команда рассмотрит ваш запрос по отелю %1$@ и ответит на %2$@. Запрос также сохранён во вкладке «Сохранённые»."),
    "Ekibimiz talebinize e-postayla dönüş yapar.": ("Our team replies to your request by email.", "Unser Team antwortet per E-Mail auf Ihre Anfrage.", "Наша команда ответит на запрос по электронной почте."),
    "Ekibimize sorun": ("Ask our team", "Unser Team fragen", "Спросить команду"),
    "Ekibimize sorun →": ("Ask our team →", "Unser Team fragen →", "Спросить команду →"),
    "En düşük fiyat": ("Lowest price", "Niedrigster Preis", "Сначала дешёвые"),
    "En yeni %lld yorum gösteriliyor.": ("Showing the %lld most recent reviews.", "Die %lld neuesten Bewertungen werden angezeigt.", "Показаны последние отзывы: %lld."),
    "Evcil hayvan": ("Pets", "Haustiere", "Питомцы"),
    "Evcil hayvan kabul eden": ("Pet-friendly", "Haustiere erlaubt", "Можно с питомцами"),
    "Evcil hayvan kabul ediliyor mu?": ("Are pets allowed?", "Sind Haustiere erlaubt?", "Можно ли с питомцами?"),
    "Fark etmez": ("No preference", "Egal", "Не важно"),
    "Filtreler": ("Filters", "Filter", "Фильтры"),
    "Filtreleri temizle": ("Clear filters", "Filter zurücksetzen", "Сбросить фильтры"),
    "Fiyat": ("Price", "Preis", "Цена"),
    "Fiyat bildirimi ayarlanamadı.": ("Couldn’t set up the price alert.", "Der Preisalarm konnte nicht eingerichtet werden.", "Не удалось настроить уведомление о цене."),
    "Fiyat düşünce haber ver": ("Notify me when the price drops", "Bei Preissenkung benachrichtigen", "Сообщать о снижении цены"),
    "Fiyat hesaplanamadı.": ("Couldn’t calculate the price.", "Der Preis konnte nicht berechnet werden.", "Не удалось рассчитать цену."),
    "Fiyat hesaplanıyor…": ("Calculating price…", "Preis wird berechnet…", "Рассчитываем цену…"),
    "Fiyat talep üzerine": ("Price on request", "Preis auf Anfrage", "Цена по запросу"),
    "Fiyat talep üzerine verilir.": ("The price is given on request.", "Der Preis wird auf Anfrage genannt.", "Цена сообщается по запросу."),
    "Fiyatlar": ("Prices", "Preise", "Цены"),
    "Fiyatlar hesaplanıyor…": ("Calculating prices…", "Preise werden berechnet…", "Рассчитываем цены…"),
    "Fiyatları göster": ("Show prices", "Preise anzeigen", "Показать цены"),
    "Fiyatı göster": ("Show price", "Preis anzeigen", "Показать цену"),
    "Fotoğraf %lld / %lld": ("Photo %1$lld / %2$lld", "Foto %1$lld / %2$lld", "Фото %1$lld / %2$lld"),
    "Fotoğraf galerisi": ("Photo gallery", "Fotogalerie", "Фотогалерея"),
    "Gecelik fiyat": ("Price per night", "Preis pro Nacht", "Цена за ночь"),
    "Geçerli bir e-posta adresi yazın.": ("Enter a valid email address.", "Geben Sie eine gültige E-Mail-Adresse ein.", "Введите действительный адрес эл. почты."),
    "Giriş": ("Check-in", "Anreise", "Заезд"),
    "Giriş ve çıkış tarihi seçince bu odanın toplam fiyatı burada görünür.": ("Choose check-in and check-out dates to see this room’s total price here.", "Wählen Sie An- und Abreise, dann erscheint hier der Gesamtpreis dieses Zimmers.", "Выберите даты заезда и выезда, и здесь появится общая цена этого номера."),
    "Giriş ve çıkış tarihi seçince oda oda toplam fiyat burada görünür.": ("Choose check-in and check-out dates to see the total price for each room here.", "Wählen Sie An- und Abreise, dann erscheint hier der Gesamtpreis je Zimmer.", "Выберите даты заезда и выезда, и здесь появится общая цена по каждому номеру."),
    "Giriş-çıkış saatleri?": ("Check-in and check-out times?", "An- und Abreisezeiten?", "Время заезда и выезда?"),
    "Golf sahası var mı?": ("Is there a golf course?", "Gibt es einen Golfplatz?", "Есть ли поле для гольфа?"),
    "Gondol": ("Gondola", "Gondel", "Гондола"),
    "Gönder": ("Send", "Senden", "Отправить"),
    "Havuz": ("Pool", "Pool", "Бассейн"),
    "Havuz var mı?": ("Is there a pool?", "Gibt es einen Pool?", "Есть ли бассейн?"),
    "Henüz kayıt yok": ("Nothing saved yet", "Noch nichts gespeichert", "Пока ничего не сохранено"),
    "Her şey dahil": ("All inclusive", "All-inclusive", "Всё включено"),
    "İletişim": ("Contact", "Kontakt", "Контакты"),
    "İndirimden önce %@": ("Before discount %@", "Vor Rabatt %@", "До скидки %@"),
    "İptal": ("Cancellation", "Stornierung", "Отмена"),
    "Kabul edilir": ("Allowed", "Erlaubt", "Разрешено"),
    "Kabul edilmez": ("Not allowed", "Nicht erlaubt", "Не разрешено"),
    "Kahvaltı dahil": ("Breakfast included", "Frühstück inklusive", "Завтрак включён"),
    "Kampanya: %@": ("Offer: %@", "Aktion: %@", "Акция: %@"),
    "Kampanyalı": ("On offer", "Mit Aktion", "С акцией"),
    "Kapasite": ("Capacity", "Kapazität", "Вместимость"),
    "Kapat": ("Close", "Schließen", "Закрыть"),
    "Kayak otellerini fotoğraftan değil, odasından pistine duraklı video turla tanıyın.": ("Get to know ski hotels through a video tour with stops, from the room to the slopes, not through photos.", "Lernen Sie Skihotels nicht über Fotos kennen, sondern per Videotour mit Stationen: vom Zimmer bis zur Piste.", "Знакомьтесь с горнолыжными отелями не по фото, а по видеотуру с остановками: от номера до трассы."),
    "Kaydedilenler": ("Saved", "Gespeichert", "Сохранённые"),
    "Kaydet": ("Save", "Speichern", "Сохранить"),
    "Kaydettiğiniz otellerin gecelik başlayan fiyatı düşünce bildirim alırsınız.": ("You’ll be notified when the starting nightly price of a saved hotel drops.", "Sie werden benachrichtigt, wenn der Ab-Preis pro Nacht eines gespeicherten Hotels sinkt.", "Вы получите уведомление, когда минимальная цена за ночь в сохранённом отеле снизится."),
    "Kaydettikleriniz": ("Your saved hotels", "Ihre gespeicherten Hotels", "Ваши сохранённые отели"),
    "Kayıttan çıkar": ("Remove from saved", "Aus Gespeichert entfernen", "Убрать из сохранённых"),
    "Keşfet": ("Explore", "Entdecken", "Обзор"),
    "Kişi": ("Guests", "Personen", "Гости"),
    "Klasik otel sitesi": ("Typical hotel site", "Klassische Hotelseite", "Обычный сайт отеля"),
    "Klasik site: %@. Otelsayfam: %@.": ("Typical site: %1$@. Otelsayfam: %2$@.", "Klassische Seite: %1$@. Otelsayfam: %2$@.", "Обычный сайт: %1$@. Otelsayfam: %2$@."),
    "Konaklama": ("Stay", "Aufenthalt", "Проживание"),
    "Konum": ("Location", "Lage", "Расположение"),
    "Kurallar": ("Policies", "Regeln", "Правила"),
    "Kış": ("Winter", "Winter", "Зима"),
    "Kışı, gitmeden önce yaşayın.": ("Experience winter before you go.", "Erleben Sie den Winter, bevor Sie anreisen.", "Почувствуйте зиму ещё до поездки."),
    "Listeden kaldır": ("Remove from list", "Aus der Liste entfernen", "Убрать из списка"),
    "Manzara": ("View", "Aussicht", "Вид"),
    "Merak ettiğinizi sorun.": ("Ask what you’d like to know.", "Fragen Sie, was Sie wissen möchten.", "Спросите о том, что вас интересует."),
    "Mesaj": ("Message", "Nachricht", "Сообщение"),
    "Mesajınızı yazın.": ("Enter your message.", "Geben Sie Ihre Nachricht ein.", "Введите сообщение."),
    "Misafir puanı 5 üzerinden %@, %lld yorum": S("Guest rating %1$@ out of 5, %#@reviews@", "Gästebewertung %1$@ von 5, %#@reviews@", "Оценка гостей %1$@ из 5, %#@reviews@", reviews=(2, REVIEW)),
    "Misafir yorumları": ("Guest reviews", "Gästebewertungen", "Отзывы гостей"),
    "Oda": ("Room", "Zimmer", "Номер"),
    "Oda hakkında": ("About the room", "Über das Zimmer", "О номере"),
    "Odada neler var?": ("What’s in the room?", "Was bietet das Zimmer?", "Что есть в номере?"),
    "Odayı incele": ("View room", "Zimmer ansehen", "Посмотреть номер"),
    "Odayı video turla gez": ("Tour the room on video", "Zimmer per Videotour ansehen", "Видеотур по номеру"),
    "Olanaklar": ("Amenities", "Ausstattung", "Удобства"),
    "Otel": ("Hotel", "Hotel", "Отель"),
    "Otel adı ya da şehir yazın.": ("Type a hotel name or city.", "Geben Sie einen Hotelnamen oder eine Stadt ein.", "Введите название отеля или город."),
    "Otel bulunamadı": ("Hotel not found", "Hotel nicht gefunden", "Отель не найден"),
    "Otel hakkında": ("About the hotel", "Über das Hotel", "Об отеле"),
    "Otel, şehir…": ("Hotel, city…", "Hotel, Stadt…", "Отель, город…"),
    "Otele dokunun, seçtiğiniz tarihlerin oda fiyatlarını görün.": ("Tap a hotel to see room prices for your dates.", "Tippen Sie auf ein Hotel, um die Zimmerpreise für Ihre Daten zu sehen.", "Нажмите на отель, чтобы увидеть цены номеров на ваши даты."),
    "Otele dön": ("Back to hotel", "Zurück zum Hotel", "Назад к отелю"),
    "Otele gitmeden önce içini gezin.": ("Walk through the hotel before you go.", "Sehen Sie sich das Hotel von innen an, bevor Sie anreisen.", "Пройдитесь по отелю ещё до поездки."),
    "Oteli video turla gez": ("Tour the hotel on video", "Hotel per Videotour ansehen", "Видеотур по отелю"),
    "Otelin yanıtı": ("Hotel’s reply", "Antwort des Hotels", "Ответ отеля"),
    "Oteller": ("Hotels", "Hotels", "Отели"),
    "Otelleri göster": ("Show hotels", "Hotels anzeigen", "Показать отели"),
    "Otelsayfam": ("Otelsayfam", "Otelsayfam", "Otelsayfam"),
    "Otelsayfam’da oteller fotoğraf galerisiyle değil, duraklı video turla tanıtılır.": ("On Otelsayfam, hotels are presented with a video tour with stops, not a photo gallery.", "Auf Otelsayfam werden Hotels nicht per Fotogalerie, sondern per Videotour mit Stationen vorgestellt.", "На Otelsayfam отели представлены не фотогалереей, а видеотуром с остановками."),
    "Otelsayfam’da termal oteller fotoğraf galerisiyle değil, duraklı video turla tanıtılır.": ("On Otelsayfam, thermal hotels are presented with a video tour with stops, not a photo gallery.", "Auf Otelsayfam werden Thermalhotels nicht per Fotogalerie, sondern per Videotour mit Stationen vorgestellt.", "На Otelsayfam термальные отели представлены не фотогалереей, а видеотуром с остановками."),
    "Önerilen": ("Recommended", "Empfohlen", "Рекомендуемые"),
    "Örneğin \"Afyon\", \"Pamukkale\" ya da \"Oruçoğlu\".": ("For example “Afyon”, “Pamukkale” or “Oruçoğlu”.", "Zum Beispiel „Afyon“, „Pamukkale“ oder „Oruçoğlu“.", "Например, «Afyon», «Pamukkale» или «Oruçoğlu»."),
    "Özel talepler, sorular…": ("Special requests, questions…", "Besondere Wünsche, Fragen…", "Особые пожелания, вопросы…"),
    "Pansiyon": ("Board", "Verpflegung", "Питание"),
    "Paylaş": ("Share", "Teilen", "Поделиться"),
    "Pist": ("Slopes", "Piste", "Трасса"),
    "Plaj": ("Beach", "Strand", "Пляж"),
    "Plaja geçiyorum.": ("Heading to the beach.", "Ich gehe zum Strand.", "Перехожу к пляжу."),
    "Plajı göster": ("Show the beach", "Zeig den Strand", "Покажи пляж"),
    "Puan %@": ("Rating %@", "Bewertung %@", "Оценка %@"),
    "Rehber şu an cevap veremedi.": ("The guide couldn’t answer right now.", "Der Guide konnte gerade nicht antworten.", "Гид сейчас не смог ответить."),
    "Rehber yalnız otelin kendi girdiği bilgilerden cevap verir ve kaynağını kartla gösterir. Bilgi kayıtlı değilse tahmin etmez, sorunuzu ekibimize iletmenizi önerir.": (
        "The guide answers only from information the hotel itself entered and shows the source on a card. If something isn’t on record it doesn’t guess; it suggests passing your question to our team.",
        "Der Guide antwortet nur anhand der Angaben, die das Hotel selbst hinterlegt hat, und zeigt die Quelle auf einer Karte. Fehlt eine Angabe, rät er nicht, sondern empfiehlt, die Frage an unser Team weiterzuleiten.",
        "Гид отвечает только на основе сведений, внесённых самим отелем, и показывает источник на карточке. Если сведений нет, он не гадает, а предлагает передать вопрос нашей команде."),
    "Rehber yazıyor…": ("The guide is typing…", "Der Guide schreibt…", "Гид печатает…"),
    "Rehbere sor": ("Ask the guide", "Guide fragen", "Спросить гида"),
    "Restoran": ("Restaurant", "Restaurant", "Ресторан"),
    "Sadece oda": ("Room only", "Nur Zimmer", "Только номер"),
    "Sayfa bulunamadı": ("Page not found", "Seite nicht gefunden", "Страница не найдена"),
    "Seçtiğiniz kişi sayısını alan oda yok. Kişi sayısını değiştirin ya da talep gönderin.": ("No room fits the number of guests you selected. Change the number of guests or send a request.", "Kein Zimmer passt zur gewählten Personenzahl. Ändern Sie die Personenzahl oder senden Sie eine Anfrage.", "Нет номера на выбранное число гостей. Измените число гостей или отправьте запрос."),
    "Seçtiğiniz tarih, kişi ya da filtrelere uyan otel bulamadık. Birini kaldırıp tekrar bakın.": ("We couldn’t find a hotel matching your dates, guests or filters. Remove one and look again.", "Wir haben kein Hotel gefunden, das zu Ihren Daten, Personen oder Filtern passt. Entfernen Sie eine Angabe und sehen Sie erneut nach.", "Мы не нашли отелей по выбранным датам, гостям или фильтрам. Уберите одно из условий и посмотрите снова."),
    "Ses üretilemedi.": ("Couldn’t generate audio.", "Die Sprachausgabe konnte nicht erzeugt werden.", "Не удалось создать аудио."),
    "Sesli sor": ("Ask by voice", "Per Sprache fragen", "Спросить голосом"),
    "Sesli soru için Ayarlar'dan mikrofon ve konuşma tanıma iznini açın.": ("To ask by voice, allow microphone and speech recognition in Settings.", "Erlauben Sie für Sprachfragen in den Einstellungen Mikrofon und Spracherkennung.", "Чтобы спрашивать голосом, разрешите доступ к микрофону и распознаванию речи в Настройках."),
    "Sesli sorun": ("Ask by voice", "Per Sprache fragen", "Спрашивайте голосом"),
    "Sesli yanıtı aç": ("Turn spoken answers on", "Sprachantworten einschalten", "Включить озвучивание ответов"),
    "Sesli yanıtı kapat": ("Turn spoken answers off", "Sprachantworten ausschalten", "Выключить озвучивание ответов"),
    "Son baktıklarınız": ("Recently viewed", "Zuletzt angesehen", "Недавно просмотренные"),
    "Sonuç yok": ("No results", "Keine Ergebnisse", "Ничего не найдено"),
    "Soru sorun, cevap alın": ("Ask a question, get an answer", "Fragen stellen, Antwort erhalten", "Задайте вопрос и получите ответ"),
    "Sorunuzu yazın…": ("Type your question…", "Ihre Frage…", "Введите вопрос…"),
    "Spa": ("Spa", "Spa", "Спа"),
    "Spa merkezine geçiyorum.": ("Heading to the spa.", "Ich gehe zum Spa-Bereich.", "Перехожу к спа-центру."),
    "Spayı göster": ("Show the spa", "Zeig das Spa", "Покажи спа"),
    "Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.": ("Couldn’t reach the server. Check your internet connection.", "Der Server ist nicht erreichbar. Prüfen Sie Ihre Internetverbindung.", "Не удалось связаться с сервером. Проверьте подключение к интернету."),
    "Sıradaki durağa geç": ("Go to the next stop", "Zur nächsten Station", "К следующей остановке"),
    "Sıralama": ("Sort by", "Sortierung", "Сортировка"),
    "Şömineli oda": ("Fireplace room", "Kaminzimmer", "Номер с камином"),
    "Şömineli odaya geçiyorum.": ("Heading to the fireplace room.", "Ich gehe zum Kaminzimmer.", "Перехожу к номеру с камином."),
    "Şömineli odayı göster": ("Show the fireplace room", "Zeig das Kaminzimmer", "Покажи номер с камином"),
    "Şu anda ücret alınmaz. Fiyatı ve müsaitliği ekibimiz talebinize dönerken teyit eder.": ("You won’t be charged now. Our team confirms price and availability when replying to your request.", "Jetzt wird nichts berechnet. Unser Team bestätigt Preis und Verfügbarkeit in der Antwort auf Ihre Anfrage.", "Сейчас оплата не взимается. Цену и наличие мест команда подтвердит в ответе на ваш запрос."),
    "%@ · Ekibimiz inceliyor": ("%@ · Under review by our team", "%@ · Wird von unserem Team geprüft", "%@ · На проверке у нашей команды"),
    "Bu talebin yazışması bu cihazda yok. Cevaplar e-postanıza gelir.": ("This request’s conversation isn’t on this device. Replies arrive by email.", "Der Verlauf dieser Anfrage ist auf diesem Gerät nicht vorhanden. Antworten kommen per E-Mail.", "Переписки по этому запросу нет на этом устройстве. Ответы приходят на электронную почту."),
    "Bu talep kapatıldı; yeni mesaj yazılamaz.": ("This request is closed; new messages can’t be sent.", "Diese Anfrage ist geschlossen; neue Nachrichten sind nicht möglich.", "Запрос закрыт; новые сообщения отправить нельзя."),
    "Bu yazışmanın bağlantısı artık geçerli değil.": ("The link to this conversation is no longer valid.", "Der Link zu diesem Verlauf ist nicht mehr gültig.", "Ссылка на эту переписку больше не действует."),
    "Bu yazışmanın bağlantısı artık geçerli değil. Yeni bir sorunuz varsa otel sayfasından talep gönderebilirsiniz.": ("The link to this conversation is no longer valid. If you have a new question, send a request from the hotel page.", "Der Link zu diesem Verlauf ist nicht mehr gültig. Bei einer neuen Frage senden Sie bitte eine Anfrage über die Hotelseite.", "Ссылка на эту переписку больше не действует. Если у вас новый вопрос, отправьте запрос со страницы отеля."),
    "Ekibimiz talebinizi inceliyor. Cevap burada ve e-postanızda görünür.": ("Our team is reviewing your request. The reply will appear here and in your email.", "Unser Team prüft Ihre Anfrage. Die Antwort erscheint hier und in Ihrem E-Mail-Postfach.", "Наша команда рассматривает ваш запрос. Ответ появится здесь и в вашей почте."),
    "Mesaj gönderilemedi.": ("The message couldn’t be sent.", "Die Nachricht konnte nicht gesendet werden.", "Не удалось отправить сообщение."),
    "Mesajınızı yazın…": ("Write your message…", "Nachricht schreiben…", "Напишите сообщение…"),
    "Oteli gör": ("View hotel", "Hotel ansehen", "Открыть отель"),
    "Siz: %@, %@": ("You: %1$@, %2$@", "Sie: %1$@, %2$@", "Вы: %1$@, %2$@"),
    "Talep": ("Request", "Anfrage", "Запрос"),
    "Web'de aç": ("Open on the web", "Im Web öffnen", "Открыть на сайте"),
    "Yazışma bulunamadı": ("Conversation not found", "Verlauf nicht gefunden", "Переписка не найдена"),
    "Yazışma kapandı": ("Conversation closed", "Verlauf geschlossen", "Переписка закрыта"),
    "Çok fazla mesaj gönderdiniz, biraz sonra tekrar deneyin.": ("You’ve sent too many messages; try again shortly.", "Sie haben zu viele Nachrichten gesendet; versuchen Sie es gleich noch einmal.", "Вы отправили слишком много сообщений; повторите попытку чуть позже."),
    "Talebi gönder": ("Send request", "Anfrage senden", "Отправить запрос"),
    "Talebiniz Otelsayfam ekibine ulaşır; size e-postayla dönüş yaparız. Müsaitlik ve fiyat bilgilendiricidir, kesin onay rezervasyonda verilir.": (
        "Your request goes to the Otelsayfam team and we reply by email. Availability and price are indicative; final confirmation is given at booking.",
        "Ihre Anfrage geht an das Otelsayfam-Team; wir antworten per E-Mail. Verfügbarkeit und Preis sind unverbindlich, die endgültige Bestätigung erfolgt bei der Buchung.",
        "Запрос поступит команде Otelsayfam, мы ответим по электронной почте. Наличие мест и цена носят справочный характер; окончательное подтверждение даётся при бронировании."),
    "Talebiniz alındı": ("Request received", "Anfrage eingegangen", "Запрос получен"),
    "Talep gönder": ("Send request", "Anfrage senden", "Отправить запрос"),
    "Talep gönderilemedi.": ("The request couldn’t be sent.", "Die Anfrage konnte nicht gesendet werden.", "Не удалось отправить запрос."),
    "Talepleriniz": ("Your requests", "Ihre Anfragen", "Ваши запросы"),
    "Tam ekran açar": ("Opens full screen", "Öffnet im Vollbild", "Открывает на весь экран"),
    "Tam pansiyon": ("Full board", "Vollpension", "Полный пансион"),
    "Tamam": ("OK", "OK", "ОК"),
    "Tarih": ("Dates", "Datum", "Даты"),
    "Tarih belirtilmedi": ("No dates given", "Keine Daten angegeben", "Даты не указаны"),
    "Tarih seçin": ("Choose dates", "Daten wählen", "Выберите даты"),
    "Tarih ve kişi": ("Dates and guests", "Daten und Personen", "Даты и гости"),
    "Tarih, kişi ve filtre": ("Dates, guests and filters", "Daten, Personen und Filter", "Даты, гости и фильтры"),
    "Tarih, kişi ve filtreleri değiştirir.": ("Changes dates, guests and filters.", "Ändert Daten, Personen und Filter.", "Изменяет даты, гостей и фильтры."),
    "Tarihlerim belli": ("I know my dates", "Meine Daten stehen fest", "Даты известны"),
    "Tekrar dene": ("Try again", "Erneut versuchen", "Повторить"),
    "Tekrar izle": ("Watch again", "Noch einmal ansehen", "Смотреть снова"),
    "Temizle": ("Clear", "Zurücksetzen", "Сбросить"),
    "Termal": ("Thermal", "Thermal", "Термальные"),
    "Termal havuz": ("Thermal pool", "Thermalbecken", "Термальный бассейн"),
    "Termal oteli gitmeden gezin, merak ettiğinizi sorun.": ("Tour the thermal hotel before you go and ask what you’d like to know.", "Sehen Sie sich das Thermalhotel vor der Anreise an und fragen Sie, was Sie wissen möchten.", "Осмотрите термальный отель до поездки и спросите о том, что вас интересует."),
    "Tur bulunamadı": ("Tour not found", "Tour nicht gefunden", "Тур не найден"),
    "Tur sırasında yapay zekâ rehberine sorun; cevabı otelin kendi bilgisinden, kaynağıyla birlikte alın.": ("Ask the AI guide during the tour and get the answer from the hotel’s own information, with its source.", "Fragen Sie während der Tour den KI-Guide; die Antwort stammt aus den Angaben des Hotels, mit Quelle.", "Спрашивайте ИИ-гида во время тура: ответ берётся из сведений самого отеля и даётся с источником."),
    "Turu bitir": ("Finish tour", "Tour beenden", "Завершить тур"),
    "Turu kapat": ("Close tour", "Tour schließen", "Закрыть тур"),
    "Turu sözle yönetin": ("Steer the tour by asking", "Die Tour per Frage steuern", "Управляйте туром словами"),
    "Tümü": ("All", "Alle", "Все"),
    "Uydurmayan cevaplar": ("Answers that aren’t made up", "Antworten ohne Erfundenes", "Ответы без выдумок"),
    "Uygun otel yok": ("No matching hotels", "Keine passenden Hotels", "Подходящих отелей нет"),
    "Uzun broşür metni": ("Long brochure text", "Langer Prospekttext", "Длинный рекламный текст"),
    "Vazgeç": ("Cancel", "Abbrechen", "Отмена"),
    "Video oynatılamadı. Bağlantınızı kontrol edip tekrar deneyin.": ("The video couldn’t be played. Check your connection and try again.", "Das Video konnte nicht abgespielt werden. Prüfen Sie Ihre Verbindung und versuchen Sie es erneut.", "Не удалось воспроизвести видео. Проверьте соединение и повторите попытку."),
    "Video tur": ("Video tour", "Videotour", "Видеотур"),
    "Video tur sırasında “%@” deyin; rehber sizi o durağa götürür. “Oteli gezdir” derseniz bütün durakları sırayla anlatır.": (
        "During the video tour say “%@” and the guide takes you to that stop. Say “Show me around” and it goes through every stop in order.",
        "Sagen Sie während der Videotour „%@“, und der Guide bringt Sie zu dieser Station. Mit „Führ mich herum“ geht er alle Stationen der Reihe nach durch.",
        "Во время видеотура скажите «%@», и гид перейдёт к этой остановке. Скажите «Покажи отель», и он пройдёт по всем остановкам по порядку."),
    "Video turu olanlar": ("With video tour", "Mit Videotour", "С видеотуром"),
    "Yakında yeni oteller eklenecek. Diğer sezonlara üstteki seçiciden bakabilirsiniz.": ("New hotels are coming soon. You can browse other seasons with the selector above.", "Bald kommen neue Hotels hinzu. Andere Saisons finden Sie über die Auswahl oben.", "Скоро появятся новые отели. Другие сезоны можно выбрать переключателем выше."),
    "Yapay Zekâ Rehberi": ("AI Guide", "KI-Guide", "ИИ-гид"),
    "Yapay zekâ rehberine sor": ("Ask the AI guide", "KI-Guide fragen", "Спросить ИИ-гида"),
    "Yarım pansiyon": ("Half board", "Halbpension", "Полупансион"),
    "Yatak": ("Bed", "Bett", "Кровать"),
    "Yayından kaldırılmış ya da adresi değişmiş olabilir.": ("It may have been removed or its address may have changed.", "Möglicherweise wurde es entfernt oder die Adresse hat sich geändert.", "Возможно, страница удалена или её адрес изменился."),
    "Yaz": ("Summer", "Sommer", "Лето"),
    "Yazmak istemezseniz mikrofona dokunun, sorunuzu söyleyin.": ("If you’d rather not type, tap the microphone and say your question.", "Wenn Sie nicht tippen möchten, tippen Sie auf das Mikrofon und sprechen Sie Ihre Frage.", "Если не хотите печатать, нажмите на микрофон и произнесите вопрос."),
    "Yazışmayı açar": ("Opens the conversation", "Öffnet den Verlauf", "Открывает переписку"),
    "Yeni cevap": ("New reply", "Neue Antwort", "Новый ответ"),
    "Yetişkin: %lld": ("Adults: %lld", "Erwachsene: %lld", "Взрослые: %lld"),
    "Yol tarifi al": ("Get directions", "Route anzeigen", "Проложить маршрут"),
    "Yorumların tümünü gör": ("See all reviews", "Alle Bewertungen ansehen", "Все отзывы"),
    "Yüklenemedi": ("Couldn’t load", "Laden fehlgeschlagen", "Не удалось загрузить"),
    "Yükleniyor": ("Loading", "Wird geladen", "Загрузка"),
    "gecelik": ("per night", "pro Nacht", "за ночь"),
    "gecelik başlayan": ("per night, from", "pro Nacht, ab", "за ночь, от"),
    "gecelik · %@": ("per night · %@", "pro Nacht · %@", "за ночь · %@"),
    "talep üzerine": ("on request", "auf Anfrage", "по запросу"),
    "“%@” ile eşleşen otel bulunamadı. Otel adını ya da şehri deneyin.": ("No hotel matches “%@”. Try a hotel name or city.", "Kein Hotel passt zu „%@“. Versuchen Sie einen Hotelnamen oder eine Stadt.", "По запросу «%@» отелей не найдено. Попробуйте название отеля или город."),
    "“Bilgi için arayın”": ("“Call for information”", "„Für Infos anrufen“", "«Звоните за информацией»"),
    "“Kapalı havuz akşam kaça kadar açık?”": ("“How late is the indoor pool open?”", "„Bis wann hat das Hallenbad abends geöffnet?“", "«До скольки вечером работает крытый бассейн?»"),
    "“Kayak dolabı odaya yakın mı?”": ("“Is the ski locker near the room?”", "„Ist der Skispind in der Nähe des Zimmers?“", "«Лыжный шкафчик рядом с номером?»"),
    "“Plaja yürüyerek kaç dakika?”": ("“How many minutes’ walk to the beach?”", "„Wie viele Minuten zu Fuß zum Strand?“", "«Сколько минут пешком до пляжа?»"),
}

# Çevrilmeyen anahtarlar (yalnız sayı).
UNTRANSLATED = {"%lld"}

WIDGET = {
    "Fiyat talep üzerine": APP["Fiyat talep üzerine"],
    "Kaydettiğiniz oteller ve gecelik başlayan fiyatları.": ("Your saved hotels and their starting nightly prices.", "Ihre gespeicherten Hotels und deren Ab-Preise pro Nacht.", "Ваши сохранённые отели и минимальные цены за ночь."),
    "Kaydettikleriniz": APP["Kaydettikleriniz"],
    "Otel kaydedin, burada görünsün.": ("Save a hotel to see it here.", "Speichern Sie ein Hotel, dann erscheint es hier.", "Сохраните отель, и он появится здесь."),
    "gecelik başlayan": APP["gecelik başlayan"],
}

# Info.plist metinleri: (tr, en, de, ru)
APP_INFO = {
    "NSLocalNetworkUsageDescription": (
        "Geliştirme sürümü, aynı ağdaki Otelsayfam test sunucusuna bağlanır.",
        "The development build connects to the Otelsayfam test server on the same network.",
        "Die Entwicklungsversion verbindet sich mit dem Otelsayfam-Testserver im selben Netzwerk.",
        "Версия для разработки подключается к тестовому серверу Otelsayfam в той же сети."),
    "NSMicrophoneUsageDescription": (
        "Rehbere sesli soru sorabilmeniz için mikrofon kullanılır.",
        "The microphone is used so you can ask the guide questions by voice.",
        "Das Mikrofon wird verwendet, damit Sie dem Guide Fragen per Sprache stellen können.",
        "Микрофон используется, чтобы вы могли задавать вопросы гиду голосом."),
    "NSSpeechRecognitionUsageDescription": (
        "Sesli sorunuz yazıya çevrilip rehbere gönderilir; cihaz destekliyorsa tanıma cihazda yapılır.",
        "Your spoken question is converted to text and sent to the guide; recognition happens on the device when supported.",
        "Ihre gesprochene Frage wird in Text umgewandelt und an den Guide gesendet; wenn möglich, erfolgt die Erkennung auf dem Gerät.",
        "Ваш голосовой вопрос преобразуется в текст и отправляется гиду; если устройство поддерживает, распознавание выполняется на нём."),
}


def catalog(table):
    strings = {}
    for key in sorted(set(table) | (UNTRANSLATED if table is APP else set())):
        if key in UNTRANSLATED:
            strings[key] = {"shouldTranslate": False}
            continue
        strings[key] = {"localizations": {lang: localization(table[key], lang) for lang in LANGS}}
    return {"sourceLanguage": "tr", "strings": strings, "version": "1.0"}


def info_catalog(table):
    strings = {}
    for key, values in table.items():
        strings[key] = {
            "extractionState": "manual",
            "localizations": {lang: unit(value) for lang, value in zip(("tr",) + LANGS, values)},
        }
    return {"sourceLanguage": "tr", "strings": strings, "version": "1.0"}


def write(path, data):
    (ROOT / path).write_text(json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True) + "\n")


def main():
    write("Otelsayfam/Resources/Localizable.xcstrings", catalog(APP))
    write("Otelsayfam/Resources/InfoPlist.xcstrings", info_catalog(APP_INFO))
    write("OtelsayfamWidgets/Localizable.xcstrings", catalog(WIDGET))
    # İsteğe bağlı denetim: dışa aktarılan anahtar listesiyle karşılaştır.
    if len(sys.argv) > 1:
        exported = json.loads(pathlib.Path(sys.argv[1]).read_text())
        for file, table in (("Otelsayfam/Resources/Localizable.xcstrings", APP), ("OtelsayfamWidgets/Localizable.xcstrings", WIDGET)):
            keys = {key for key, _ in exported.get(file, [])}
            known = set(table) | UNTRANSLATED
            for key in sorted(keys - known):
                print(f"ÇEVİRİSİ YOK  {file}: {key!r}")
            for key in sorted(known - keys - UNTRANSLATED):
                print(f"KULLANILMIYOR {file}: {key!r}")
    print(f"{len(APP)} uygulama, {len(WIDGET)} widget metni yazıldı.")


if __name__ == "__main__":
    main()
