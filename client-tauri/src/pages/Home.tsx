import { Link } from "react-router-dom";

function Home() {
    return (
        <div>
            <h2>Home</h2>
            <Link to="/about">About</Link><br />
            <Link to="/dashboard">Dashboard</Link><br />
            <Link to="/dynamic">Dynamic</Link>
        </div>
    );
}

export default Home;