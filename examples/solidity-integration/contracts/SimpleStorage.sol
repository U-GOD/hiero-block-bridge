// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

/**
 * @title SimpleStorage
 * @dev A minimal EVM compatible smart contract to showcase Hedera state execution via HieroBlockBridge
 */
contract SimpleStorage {
    uint256 public storedData;

    event DataChanged(uint256 newValue);

    function set(uint256 x) public {
        storedData = x;
        emit DataChanged(x);
    }

    function get() public view returns (uint256) {
        return storedData;
    }
}
