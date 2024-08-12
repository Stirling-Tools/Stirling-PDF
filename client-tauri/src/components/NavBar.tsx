import StirlingLogo from "../assets/favicon.svg";
import NavBarStyles from "./NavBar.module.css";

function NavBar() {
    return (
        <nav>
            <a className={NavBarStyles.navbar_brand} href="/">
                <img className={NavBarStyles.main_icon} src={StirlingLogo} alt="icon"/>
                <span className={NavBarStyles.icon_text}>Stirling PDF</span>
            </a>
        </nav>
    );
}

export default NavBar;