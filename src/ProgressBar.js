import React, { Component } from "react";
import styled from 'styled-components'

const Track = styled.div`
    width: 50%;
    height: 20px;
    background: #2c4251;
    border-radius: 10px;
    box-shadow: inset 0 0 5px #000;
`;

const Thumb = styled.div`
    width: ${props => props.percentage}%;
    height: 100%;
    background: #6bccf9;
    border-radius: 8px;
    transition: width 0.3s ease-in-out
`;

class ProgressBar extends Component {

    clamp = (min, value, max) => {
        return Math.min(Math.max(min, value), max);
    }

    render() {
        return (
            <Track>
            <Thumb percentage={this.clamp(0, this.props.percentage, 100)}/>
            </Track>
        )
    }
}

export default ProgressBar