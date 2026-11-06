
.nyra-footer {
    width: 100%;
    padding: 75px 20px 25px;
    text-align: center;
    background: transparent;
    color: #70464b;
    position: relative;
    overflow: hidden;
}

.footer-flower {
    font-size: 42px;
    color: #b77d82;
    margin-bottom: 15px;
}

.footer-overline {
    font-size: 12px;
    letter-spacing: 4px;
    color: #a66e73;
    margin-bottom: 15px;
}

.nyra-footer h2 {
    font-family: 'Great Vibes', cursive;
    font-size: clamp(38px, 6vw, 58px);
    font-weight: 400;
    color: #985c65;
    margin-bottom: 20px;
}

.footer-message {
    max-width: 520px;
    margin: 0 auto;
    font-family: 'Cormorant Garamond', serif;
    font-size: 19px;
    line-height: 1.7;
    color: #704d50;
}

.footer-divider {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 15px;
    margin: 30px auto;
    color: #ad777c;
}

.footer-divider::before,
.footer-divider::after {
    content: "";
    width: 65px;
    height: 1px;
    background: #c99b9d;
}

.footer-divider span {
    font-size: 20px;
}

.nyra-footer h3 {
    font-family: 'Playfair Display', serif;
    font-size: clamp(17px, 3vw, 23px);
    font-weight: 500;
    color: #86565c;
    margin-bottom: 12px;
}

.footer-date {
    font-family: 'Cormorant Garamond', serif;
    font-size: 18px;
    letter-spacing: 1px;
    color: #79575a;
}

.footer-closing {
    margin-top: 35px;
    font-family: 'Great Vibes', cursive;
    font-size: 30px;
    color: #a56b73;
}

.footer-bottom {
    margin-top: 40px;
    padding-top: 18px;
    border-top: 1px solid rgba(160, 105, 110, 0.25);
    font-size: 11px;
    letter-spacing: 1px;
    color: #98777a;
}

@media (max-width: 600px) {
    .nyra-footer {
        padding: 55px 18px 20px;
    }

    .footer-message {
        font-size: 17px;
    }

    .footer-date {
        font-size: 16px;
    }
}
