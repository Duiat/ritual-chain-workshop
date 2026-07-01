// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AIJudgeHidden} from "./AIJudgeHidden.sol";

contract AIJudgeHiddenTest is Test {
    AIJudgeHidden internal judge;

    address internal owner = address(0xA11CE);
    address internal alice = address(0xA71CE);
    address internal bob = address(0xB0B);

    uint256 internal bountyId;
    uint256 internal deadline;

    function setUp() public {
        judge = new AIJudgeHidden();
        vm.deal(owner, 10 ether);
        vm.deal(alice, 1 ether);
        vm.deal(bob, 1 ether);

        deadline = block.timestamp + 1 days;
        vm.prank(owner);
        bountyId = judge.createBounty{value: 1 ether}(
            "TEE hidden bounty",
            "Best encrypted answer wins",
            deadline
        );
    }

    function test_submitEncryptedAnswer_storesCiphertextOnly() public {
        bytes memory cipher = hex"c0ffee01";
        bytes memory sig = hex"deadbeef";

        vm.prank(alice);
        judge.submitEncryptedAnswer(bountyId, cipher, sig);

        (
            address submitter,
            bytes memory storedCipher,
            bytes memory storedSig,
            bytes32 secretsHash,
            string memory secretKey
        ) = judge.getSubmission(bountyId, 0);

        assertEq(submitter, alice);
        assertEq(keccak256(storedCipher), keccak256(cipher));
        assertEq(keccak256(storedSig), keccak256(sig));
        assertEq(secretsHash, keccak256(cipher));
        assertEq(secretKey, "SUB_0");
    }

    function test_submitEncryptedAnswer_revertsAfterDeadline() public {
        vm.warp(deadline);

        vm.prank(alice);
        vm.expectRevert("submission phase closed");
        judge.submitEncryptedAnswer(bountyId, hex"01", hex"02");
    }

    function test_judgeAll_revertsBeforeDeadline() public {
        vm.prank(alice);
        judge.submitEncryptedAnswer(bountyId, hex"01", hex"02");

        vm.prank(owner);
        vm.expectRevert("submission phase open");
        judge.judgeAll(bountyId, hex"");
    }

    function test_judgeAll_revertsWithNoSubmissions() public {
        vm.warp(deadline);

        vm.prank(owner);
        vm.expectRevert("no submissions");
        judge.judgeAll(bountyId, hex"");
    }

    function test_submissionSecretKey_isDeterministic() public view {
        assertEq(judge.submissionSecretKey(0), "SUB_0");
        assertEq(judge.submissionSecretKey(12), "SUB_12");
    }

    function test_multipleEncryptedSubmissions() public {
        vm.prank(alice);
        judge.submitEncryptedAnswer(bountyId, hex"aa", hex"11");

        vm.prank(bob);
        judge.submitEncryptedAnswer(bountyId, hex"bb", hex"22");

        (, , , , string memory key0) = judge.getSubmission(bountyId, 0);
        (, , , , string memory key1) = judge.getSubmission(bountyId, 1);

        assertEq(key0, "SUB_0");
        assertEq(key1, "SUB_1");

        (, , , , , , , uint256 submissionCount, , ) = judge.getBounty(bountyId);
        assertEq(submissionCount, 2);
    }
}