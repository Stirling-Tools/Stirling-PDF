import { Link } from "react-router-dom";

function NoMatch() {
    return (
        <div>
            <h2>The Page you are trying to access does not exist.</h2>
            <p>
                <Link to="/">Go back home...</Link>
            </p>
        </div>
    );
}

export default NoMatch;