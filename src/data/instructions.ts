export interface InstructionSection {
  title: string;
  desc: string;
  iconName: 'table' | 'mic' | 'radio' | 'sparkles' | 'maximize' | 'offline';
  badge?: string;
}

export interface InstructionLocale {
  modalTitle: string;
  modalSubtitle: string;
  selectLanguageLabel: string;
  translateCustomLabel: string;
  sections: InstructionSection[];
  tipsTitle: string;
  tips: string[];
  closeBtn: string;
}

export const INSTRUCTIONS_LOCALES: Record<string, InstructionLocale> = {
  es: {
    modalTitle: 'Guía de Uso e Instrucciones',
    modalSubtitle: 'Cómo conversar cara a cara en cualquier idioma con Traductor Ya',
    selectLanguageLabel: 'Idioma de la guía',
    translateCustomLabel: 'Traducir guía con IA a otro idioma',
    sections: [
      {
        title: '1. Modo Cara a Cara en Mesa',
        desc: 'Coloca el móvil plano sobre la mesa entre ambos. La pantalla se divide en dos: la mitad superior se invierte 180° para que tu interlocutor lea directamente hacia él con su botón de hablar orientado en su sentido.',
        iconName: 'table',
        badge: 'Recomendado',
      },
      {
        title: '2. Distancia y Captación de Voz',
        desc: 'El micrófono capta la voz a distancia de mesa (1 a 2 metros). Si el ambiente es ruidoso (cafeterías, aeropuertos), acerca suavemente el móvil a la persona mientras habla para una transcripción perfecta.',
        iconName: 'mic',
      },
      {
        title: '3. Modo Manos Libres (Escucha Continua)',
        desc: 'Activa "Modo Mesa / Manos Libres". El traductor escuchará automáticamente las pausas naturales de voz, traducirá, reproducirá el audio en el otro idioma y alternará el turno sin que nadie tenga que pulsar la pantalla.',
        iconName: 'radio',
        badge: 'Automático',
      },
      {
        title: '4. Detección Automática de Idioma',
        desc: 'Si no sabes qué idioma habla la otra persona, selecciona "Detectar idioma ✨" en su lado. Al empezar a hablar, la IA identificará su lengua al instante y te traducirá la conversación.',
        iconName: 'sparkles',
      },
      {
        title: '5. Modo Pantalla Completa / Presentación',
        desc: 'Toca el icono de maximizar para proyectar la traducción en letras gigantes. Ideal para enseñar la pantalla a taxistas, dependientes o transeúntes en la calle.',
        iconName: 'maximize',
      },
      {
        title: '6. Instalación PWA y Uso sin Conexión',
        desc: 'Pulsa "Instalar App" para tenerla en la pantalla de inicio como una aplicación nativa. Podrás revisar todo el historial de conversaciones guardado localmente aunque no tengas cobertura.',
        iconName: 'offline',
      },
    ],
    tipsTitle: 'Consejos rápidos para una conversación fluida',
    tips: [
      'Pronuncia frases naturales y espera a que termine de hablar antes de responder.',
      'Puedes pulsar el botón de volumen para repetir la pronunciación o pulsar "Lento" para oírla despacio.',
      'En ambientes con mucho viento o ruido, usa el botón de "Frases Rápidas" con un solo toque.',
    ],
    closeBtn: 'Entendido, empezar a traducir',
  },
  en: {
    modalTitle: 'User Guide & Instructions',
    modalSubtitle: 'How to converse face-to-face in any language with Traductor Ya',
    selectLanguageLabel: 'Guide language',
    translateCustomLabel: 'Translate guide with AI to another language',
    sections: [
      {
        title: '1. Face-to-Face Table Mode',
        desc: 'Place the phone flat on the table between both people. The screen splits in half: the top half is flipped 180° so your partner can read right-side up, with their own speak button oriented toward them.',
        iconName: 'table',
        badge: 'Recommended',
      },
      {
        title: '2. Distance and Voice Pickup',
        desc: 'The microphone picks up voices across a table (1 to 2 meters). In noisy environments (cafes, train stations), gently hold the phone closer to the speaker for crystal clear voice recognition.',
        iconName: 'mic',
      },
      {
        title: '3. Hands-Free Mode (Continuous Listening)',
        desc: 'Turn on "Hands-Free Mode". The translator automatically detects natural speech pauses, translates, speaks the translation out loud, and switches speaker turns without tapping buttons.',
        iconName: 'radio',
        badge: 'Automatic',
      },
      {
        title: '4. Automatic Language Detection',
        desc: 'If you do not know which language the other person speaks, pick "Auto-detect ✨". As soon as they speak, the AI instantly detects their language and translates it into yours.',
        iconName: 'sparkles',
      },
      {
        title: '5. Fullscreen Presentation Mode',
        desc: 'Tap the maximize icon on any translation to show it in massive, high-contrast text. Perfect for showing to taxi drivers, waiters, or locals in loud streets.',
        iconName: 'maximize',
      },
      {
        title: '6. PWA Installation & Offline History',
        desc: 'Click "Install App" to add it to your home screen like a native application. You can review all locally saved conversations even when completely offline.',
        iconName: 'offline',
      },
    ],
    tipsTitle: 'Quick tips for smooth conversations',
    tips: [
      'Speak naturally and pause briefly before the other person replies.',
      'Tap the speaker icon to repeat pronunciation, or choose "Slow" to hear it at 0.75x speed.',
      'Use the "Quick Phrases" button for one-tap travel and emergency sentences.',
    ],
    closeBtn: 'Got it, start translating',
  },
  fr: {
    modalTitle: 'Guide d’utilisation & Instructions',
    modalSubtitle: 'Comment dialoguer face à face dans n’importe quelle langue',
    selectLanguageLabel: 'Langue du guide',
    translateCustomLabel: 'Traduire le guide par IA dans une autre langue',
    sections: [
      {
        title: '1. Mode Face-à-face sur table',
        desc: 'Posez le téléphone à plat entre vous deux. L’écran se divise en deux : le haut est inversé à 180° pour que votre interlocuteur lise directement avec son bouton de parole orienté vers lui.',
        iconName: 'table',
        badge: 'Recommandé',
      },
      {
        title: '2. Distance et capture vocale',
        desc: 'Le microphone capte la voix à distance de table (1 à 2 mètres). En milieu bruyant, rapprochez le téléphone de la personne pour une transcription optimale.',
        iconName: 'mic',
      },
      {
        title: '3. Mode Mains Libres (Écoute continue)',
        desc: 'Activez "Mains Libres". Le traducteur détecte automatiquement les pauses de voix, traduit, prononce la réponse à voix haute et alterne les tours de parole sans toucher l’écran.',
        iconName: 'radio',
        badge: 'Automatique',
      },
      {
        title: '4. Détection automatique de la langue',
        desc: 'Si vous ignorez la langue de l’autre personne, choisissez "Détecter la langue ✨". Dès qu’elle commence à parler, l’IA identifie sa langue et vous traduit la phrase.',
        iconName: 'sparkles',
      },
      {
        title: '5. Mode Plein Écran / Présentation',
        desc: 'Touchez l’icône d’agrandissement pour afficher la traduction en lettres géantes. Idéal à montrer aux chauffeurs de taxi ou serveurs dans les endroits bruyants.',
        iconName: 'maximize',
      },
      {
        title: '6. Installation PWA et mode hors ligne',
        desc: 'Cliquez sur "Installer l’app" pour l’ajouter à votre écran d’accueil. Vous pouvez consulter tout votre historique local même sans connexion internet.',
        iconName: 'offline',
      },
    ],
    tipsTitle: 'Conseils pour une conversation fluide',
    tips: [
      'Parlez calmement et marquez une courte pause après avoir parlé.',
      'Appuyez sur l’icône haut-parleur pour réécouter ou sur "Lent" pour écouter à 0.75x.',
      'Consultez les "Phrases Rapides" pour les besoins de voyage fréquents.',
    ],
    closeBtn: 'Compris, commencer à traduire',
  },
  de: {
    modalTitle: 'Bedienungsanleitung & Tipps',
    modalSubtitle: 'Wie Sie mit Traductor Ya von Angesicht zu Angesicht übersetzen',
    selectLanguageLabel: 'Sprache der Anleitung',
    translateCustomLabel: 'Anleitung mit KI in eine andere Sprache übersetzen',
    sections: [
      {
        title: '1. Tischmodus von Angesicht zu Angesicht',
        desc: 'Legen Sie das Telefon flach auf den Tisch zwischen beide Personen. Der obere Bildschirmbereich ist um 180° gedreht, damit Ihr Gegenüber alles richtig herum lesen kann.',
        iconName: 'table',
        badge: 'Empfohlen',
      },
      {
        title: '2. Mikrofonabstand & Reichweite',
        desc: 'Das Mikrofon erfasst Stimmen über Tischdistanz (1 bis 2 Meter). In lauten Umgebungen halten Sie das Telefon einfach etwas näher an den Sprecher.',
        iconName: 'mic',
      },
      {
        title: '3. Freisprechmodus (Kontinuierlich)',
        desc: 'Aktivieren Sie "Freisprechen". Die App erkennt Sprechpausen automatisch, übersetzt sofort, liest das Ergebnis laut vor und schaltet nahtlos um.',
        iconName: 'radio',
        badge: 'Automatisch',
      },
      {
        title: '4. Automatische Spracherkennung',
        desc: 'Wenn Sie die Sprache Ihres Gegenübers nicht kennen, wählen Sie "Sprache erkennen ✨". Die KI identifiziert die gesprochene Sprache sofort.',
        iconName: 'sparkles',
      },
      {
        title: '5. Vollbild-Präsentationsmodus',
        desc: 'Tippen Sie auf das Vergrößern-Symbol, um die Übersetzung in riesiger Schrift anzuzeigen – ideal für Taxifahrer oder Kellner.',
        iconName: 'maximize',
      },
      {
        title: '6. PWA-Installation & Offline-Verlauf',
        desc: 'Installieren Sie die App auf Ihrem Startbildschirm, um gespeicherte Gespräche auch ohne Internetverbindung jederzeit abzurufen.',
        iconName: 'offline',
      },
    ],
    tipsTitle: 'Tipps für flüssige Gespräche',
    tips: [
      'Sprechen Sie in natürlichen Sätzen und machen Sie kurze Pausen.',
      'Nutzen Sie die Taste "Langsam", um schwierige Aussprachen bei 0.75x Geschwindigkeit zu hören.',
      'Nutzen Sie die "Schnellphrasen" für gängige Notfälle und Reisen.',
    ],
    closeBtn: 'Verstanden, Übersetzung starten',
  },
  it: {
    modalTitle: 'Guida all’uso e Istruzioni',
    modalSubtitle: 'Come conversare faccia a faccia in qualsiasi lingua',
    selectLanguageLabel: 'Lingua della guida',
    translateCustomLabel: 'Traduci la guida con l’IA in un’altra lingua',
    sections: [
      {
        title: '1. Modalità Faccia a Faccia su tavolo',
        desc: 'Appoggia il telefono sul tavolo tra voi due. Lo schermo si divide a metà: la parte superiore è capovolta di 180° per permettere al tuo interlocutore di leggere comodamente.',
        iconName: 'table',
        badge: 'Consigliato',
      },
      {
        title: '2. Distanza e cattura vocale',
        desc: 'Il microfono rileva la voce a distanza di tavolo (1-2 metri). In ambienti rumorosi, avvicina il telefono a chi parla per la massima precisione.',
        iconName: 'mic',
      },
      {
        title: '3. Modalità Vivavoce (Ascolto Continuo)',
        desc: 'Attiva "Vivavoce". Il traduttore riconosce le pause naturali, traduce, legge ad alta voce la traduzione e alterna i turni automaticamente.',
        iconName: 'radio',
        badge: 'Automatico',
      },
      {
        title: '4. Rilevamento automatico della lingua',
        desc: 'Se non conosci la lingua dell’altra persona, seleziona "Rileva lingua ✨". L’IA identificherà la lingua non appena inizia a parlare.',
        iconName: 'sparkles',
      },
      {
        title: '5. Schermo intero / Presentazione',
        desc: 'Tocca l’icona a schermo intero per mostrare la traduzione a caratteri giganti a tassisti o camerieri in luoghi caotici.',
        iconName: 'maximize',
      },
      {
        title: '6. Installazione PWA e Uso Offline',
        desc: 'Installa l’app nella schermata iniziale per consultare la cronologia delle conversazioni salvata in locale anche senza rete.',
        iconName: 'offline',
      },
    ],
    tipsTitle: 'Consigli per un dialogo fluido',
    tips: [
      'Parla con naturalezza e lascia terminare l’altra persona.',
      'Premi "Lento" per ascoltare la pronuncia a velocità ridotta (0.75x).',
      'Usa le "Frasi Rapide" per i saluti e le emergenze di viaggio.',
    ],
    closeBtn: 'Ho capito, inizia a tradurre',
  },
  pt: {
    modalTitle: 'Guia de Uso e Instruções',
    modalSubtitle: 'Como conversar face a face em qualquer idioma',
    selectLanguageLabel: 'Idioma do guia',
    translateCustomLabel: 'Traduzir guia com IA para outro idioma',
    sections: [
      {
        title: '1. Modo Face a Face na Mesa',
        desc: 'Coloque o telemóvel na mesa entre os dois. O ecrã divide-se ao meio: a parte superior fica invertida 180° para que o seu interlocutor leia diretamente na direção dele.',
        iconName: 'table',
        badge: 'Recomendado',
      },
      {
        title: '2. Distância e Captação de Voz',
        desc: 'O microfone capta vozes à distância da mesa (1 a 2 metros). Se houver muito ruído, aproxime o telemóvel de quem está a falar.',
        iconName: 'mic',
      },
      {
        title: '3. Modo Mãos-Livres (Escuta Contínua)',
        desc: 'Ative o modo "Mãos-Livres". O tradutor deteta pausas naturais, traduz, lê a tradução em voz alta e alterna os turnos automaticamente.',
        iconName: 'radio',
        badge: 'Automático',
      },
      {
        title: '4. Deteção Automática de Idioma',
        desc: 'Se não sabe que língua a pessoa fala, escolha "Detetar idioma ✨". A IA identifica a língua assim que ela começar a falar.',
        iconName: 'sparkles',
      },
      {
        title: '5. Modo Ecrã Completo / Apresentação',
        desc: 'Toque no ícone de maximizar para mostrar a tradução em letras gigantes a taxistas ou funcionários em locais movimentados.',
        iconName: 'maximize',
      },
      {
        title: '6. Instalação PWA e Uso Offline',
        desc: 'Instale a app no ecrã inicial para aceder ao histórico de conversas guardado localmente mesmo sem ligação à internet.',
        iconName: 'offline',
      },
    ],
    tipsTitle: 'Dicas para uma conversa fluida',
    tips: [
      'Fale naturalmente e faça uma breve pausa ao terminar.',
      'Toque em "Lento" para ouvir a pronúncia a 0.75x de velocidade.',
      'Use o botão "Frases Rápidas" para situações frequentes de viagem.',
    ],
    closeBtn: 'Entendido, começar a traduzir',
  },
  zh: {
    modalTitle: '使用指南与说明',
    modalSubtitle: '如何使用 Traductor Ya 进行面对面跨语言即时对话',
    selectLanguageLabel: '指南语言',
    translateCustomLabel: '使用 AI 将指南翻译为其他语言',
    sections: [
      {
        title: '1. 面对面桌面模式',
        desc: '将手机平放在两人中间的桌面上。屏幕上下分割：上半部分自动旋转180度，方便对方直接正向阅读，各自拥有独立的语音按键。',
        iconName: 'table',
        badge: '推荐',
      },
      {
        title: '2. 语音拾音距离',
        desc: '麦克风可在桌面距离（1至2米）内清晰收音。如在餐厅、车站等嘈杂环境中，可在对方说话时将手机稍靠近对方。',
        iconName: 'mic',
      },
      {
        title: '3. 免提连续监听模式',
        desc: '开启“免提模式”。翻译器将自动识别说话停顿，即时翻译并语音朗读，无需每次点击按钮即可连续轮流交流。',
        iconName: 'radio',
        badge: '全自动',
      },
      {
        title: '4. 自动语言识别',
        desc: '如不确定对方使用的语言，可选择“自动检测 ✨”。对方开口说话时，AI 将自动识别其语种并为您翻译。',
        iconName: 'sparkles',
      },
      {
        title: '5. 全屏展示模式',
        desc: '点击全屏按钮可以超大清晰字体向出租车司机、服务员或路人展示翻译内容。',
        iconName: 'maximize',
      },
      {
        title: '6. PWA 应用安装与离线历史',
        desc: '点击“安装应用”可将其添加到桌面。即使无网络信号，也可以离线查阅所有本地保存的历史对话。',
        iconName: 'offline',
      },
    ],
    tipsTitle: '流畅对话技巧',
    tips: [
      '用自然语调说话，说完后稍作停顿以便对方接话。',
      '点击发音按钮可重复收听，点击“慢速”可以0.75倍速细听发音。',
      '遇到紧急情况或餐厅点餐，可直接使用“常用短语”。',
    ],
    closeBtn: '了解，开始翻译',
  },
  ja: {
    modalTitle: '使い方ガイド＆取扱説明書',
    modalSubtitle: 'Traductor Ya を使ってあらゆる言語で対面会話する方法',
    selectLanguageLabel: 'ガイドの言語',
    translateCustomLabel: 'AIで他の言語にガイドを翻訳',
    sections: [
      {
        title: '1. テーブル対面モード',
        desc: '2人の間のテーブルにスマホを平らに置きます。画面が上下に分かれ、相手側が180度反転するため、お互い向き合ったまま快適に読めます。',
        iconName: 'table',
        badge: 'おすすめ',
      },
      {
        title: '2. 集音距離とマイクの使い方',
        desc: 'テーブルを挟んだ距離（1〜2m）から音声をクリアに拾います。騒がしい場所では相手の口元に少し近づけて話してください。',
        iconName: 'mic',
      },
      {
        title: '3. ハンズフリー（自動連続会話）',
        desc: '「ハンズフリー」をONにすると、話終わりの無音を自動検知して翻訳・音声再生し、ボタンを押さずに交互に会話できます。',
        iconName: 'radio',
        badge: '自動',
      },
      {
        title: '4. 言語の自動認識',
        desc: '相手の言語が分からない場合は「言語を自動検出 ✨」を選択。話された言葉からAIが瞬時に言語を判別して翻訳します。',
        iconName: 'sparkles',
      },
      {
        title: '5. 全画面プレゼンテーションモード',
        desc: '拡大アイコンをタップすると特大文字で表示。タクシー運転手や店員さんに見せる際に便利です。',
        iconName: 'maximize',
      },
      {
        title: '6. PWAインストールとオフライン履歴',
        desc: '「アプリをインストール」でホーム画面に追加可能。電波のない場所でも保存された会話履歴を確認できます。',
        iconName: 'offline',
      },
    ],
    tipsTitle: 'スムーズな会話のコツ',
    tips: [
      '自然な声で話し、相手の発言を待ちましょう。',
      '「ゆっくり」ボタンで0.75倍速のゆっくり発音を確認できます。',
      '旅行や緊急時は「クイックフレーズ」が便利です。',
    ],
    closeBtn: '了解、翻訳を始める',
  },
  ru: {
    modalTitle: 'Инструкция по использованию',
    modalSubtitle: 'Как вести живой диалог на любом языке с Traductor Ya',
    selectLanguageLabel: 'Язык инструкции',
    translateCustomLabel: 'Перевести инструкцию с помощью ИИ',
    sections: [
      {
        title: '1. Режим лицом к лицу на столе',
        desc: 'Положите телефон на стол между собеседниками. Верхняя часть экрана перевернута на 180°, чтобы ваш партнер мог удобно читать и нажимать свою кнопку микрофона.',
        iconName: 'table',
        badge: 'Рекомендуется',
      },
      {
        title: '2. Расстояние и захват голоса',
        desc: 'Микрофон четко улавливает голос на расстоянии стола (1-2 метра). В шумных местах просто поднесите телефон чуть ближе к говорящему.',
        iconName: 'mic',
      },
      {
        title: '3. Режим «Свободные руки» (Автоматический)',
        desc: 'Включите «Свободные руки». Переводчик сам определяет паузы в речи, переводит, озвучивает текст и передает ход собеседнику без нажатия кнопок.',
        iconName: 'radio',
        badge: 'Авто',
      },
      {
        title: '4. Автоопределение языка',
        desc: 'Если вы не знаете язык собеседника, выберите «Определить язык ✨». ИИ мгновенно распознает речь и переведет ее.',
        iconName: 'sparkles',
      },
      {
        title: '5. Полноэкранный режим презентации',
        desc: 'Нажмите значок развертывания, чтобы показать перевод крупным текстом таксисту или официанту на шумной улице.',
        iconName: 'maximize',
      },
      {
        title: '6. Установка PWA и офлайн-доступ',
        desc: 'Нажмите «Установить приложение», чтобы сохранить его на рабочий стол и просматривать сохраненную историю даже без интернета.',
        iconName: 'offline',
      },
    ],
    tipsTitle: 'Советы для легкого общения',
    tips: [
      'Говорите естественно и делайте небольшую паузу после фразы.',
      'Нажмите кнопку «Медленно», чтобы прослушать произношение со скоростью 0.75x.',
      'Используйте «Быстрые фразы» для стандартных ситуаций в поездках.',
    ],
    closeBtn: 'Понятно, начать перевод',
  },
  ar: {
    modalTitle: 'دليل الاستخدام والتعليمات',
    modalSubtitle: 'كيفية التحدث وجهاً لوجه بأي لغة مع Traductor Ya',
    selectLanguageLabel: 'لغة الدليل',
    translateCustomLabel: 'ترجمة الدليل بالذكاء الاصطناعي إلى لغة أخرى',
    sections: [
      {
        title: '1. وضع المواجهة على الطاولة',
        desc: 'ضع الهاتف على الطاولة بينكما. تنقسم الشاشة إلى نصفين: ينقلب النصف العلوي 180 درجة ليقرأ الطرف الآخر مباشرة في اتجاهه مع زر التحدث الموجه إليه.',
        iconName: 'table',
        badge: 'موصى به',
      },
      {
        title: '2. مسافة التقاط الصوت',
        desc: 'يلتقط الميكروفون الصوت عبر مسافة الطاولة (1 إلى 2 متر). في الأماكن المزدحمة، قرّب الهاتف بلطف من المتحدث للحصول على أدق ترجمة.',
        iconName: 'mic',
      },
      {
        title: '3. وضع حر اليدين (استماع مستمر)',
        desc: 'فعّل "وضع حر اليدين". سيتعرف المترجم تلقائياً على فترات التوقف، ويترجم وينطق الإجابة بصوت عالٍ ويتبادل الأدوار دون لمس الشاشة.',
        iconName: 'radio',
        badge: 'تلقائي',
      },
      {
        title: '4. التعرف التلقائي على اللغة',
        desc: 'إذا كنت لا تعرف لغة الشخص الآخر، اختر "تحديد اللغة تلقائياً ✨". سيتعرف الذكاء الاصطناعي على لغته فور بدء حديثه.',
        iconName: 'sparkles',
      },
      {
        title: '5. وضع ملء الشاشة للعرض',
        desc: 'اضغط على زر التكبير لعرض الترجمة بخط ضخم وواضح لإظهارها لسائقي التاكسي أو في المطاعم المزدحمة.',
        iconName: 'maximize',
      },
      {
        title: '6. تثبيت التطبيق والعمل دون إنترنت',
        desc: 'اضغط على "تثبيت التطبيق" لإضافته إلى شاشتك الرئيسية والاطلاع على السجل المحفوظ محلياً حتى في غياب التغطية.',
        iconName: 'offline',
      },
    ],
    tipsTitle: 'نصائح لمحادثة طبيعية وسلسة',
    tips: [
      'تحدث بنبرة طبيعية وتوقف قليلاً قبل أن يجيب الطرف الآخر.',
      'اضغط على زر "بطيء" لسماع النطق بسرعة 0.75x لفهم الكلمات الصعبة.',
      'استخدم قسم "العبارات السريعة" في حالات الطوارئ والسفر.',
    ],
    closeBtn: 'فهمت، ابدأ الترجمة',
  },
};

export const GUIDE_LANGUAGE_OPTIONS = [
  { code: 'es', name: 'Español', flag: '🇪🇸' },
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
  { code: 'it', name: 'Italiano', flag: '🇮🇹' },
  { code: 'pt', name: 'Português', flag: '🇧🇷' },
  { code: 'zh', name: '中文', flag: '🇨🇳' },
  { code: 'ja', name: '日本語', flag: '🇯🇵' },
  { code: 'ru', name: 'Русский', flag: '🇷🇺' },
  { code: 'ar', name: 'العربية', flag: '🇸🇦' },
];
