import { Fragment } from "react";
import { Link } from "react-router-dom";

function NoMatch() {
    return (
        <Fragment>
            <h2>The Page you are trying to access does not exist.</h2>
            <p>
                <Link to="/">Go back home...</Link>
            </p>
        </Fragment>
    );
}

export default NoMatch;