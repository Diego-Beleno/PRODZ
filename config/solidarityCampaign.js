// config/solidarityCampaign.js
// Configuración centralizada para la Campaña Solidaria de apoyo humanitario.

const SOLIDARITY_CONFIG = {
    isActive: true,
    primaryDonationUrl: "https://caritasvenezuela.org",
    analyticsEventName: "click_donation_venezuela",
    flagEmoji: "\u{1F1FB}\u{1F1EA}",
    title: "Unidos por Venezuela",
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
