// config/solidarityCampaign.js
// Configuración centralizada para la Campaña Solidaria de apoyo humanitario.

const SOLIDARITY_CONFIG = {
    isActive: true,
    primaryDonationUrl: "https://terremoto.hazlohoy.org",
    analyticsEventName: "click_donation_venezuela",
    flagEmoji: "\u{1F1FB}\u{1F1EA}",
    title: "Unidos por Venezuela",
    message: "Ante el reciente terremoto que ha afectado a tantas familias, hemos decidido aportar nuestro grano de arena. El 100% de los ingresos recaudados a trav\u00E9s de esta p\u00E1gina web ser\u00E1 donado directamente a las familias que lo necesiten.",
    primaryLabel: "Donar Ahora",
    bannerSpeed: 60,
    bannerAccent: "#ffffff"
};

// Se expone en el ámbito global (window) para consumo en el cliente (script.js)
if (typeof window !== 'undefined') {
    window.SOLIDARITY_CONFIG = SOLIDARITY_CONFIG;
}

// Soporte opcional para exportación en entornos de módulos
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SOLIDARITY_CONFIG };
}
