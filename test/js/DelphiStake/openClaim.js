/* eslint-env mocha */
/* global contract artifacts assert */

const DelphiStake = artifacts.require('DelphiStake');
const EIP20 = artifacts.require('EIP20');

const utils = require('../utils.js');
const BN = require('bignumber.js');

const conf = utils.getConfig();

contract('DelphiStake', (accounts) => {
  describe('Function: openClaim', () => {
    const [staker, claimant, arbiter, other] = accounts;

    const claimAmount = '1';
    const feeAmount = '10';
    const startingClaims = new BN('0', 10);

    let ds;
    let token;

    beforeEach(async () => {
      token = await EIP20.new(1000000, 'Delphi Tokens', 18, 'DELPHI', { from: staker });
      await token.transfer(claimant, 100000, { from: staker });
      await token.transfer(arbiter, 100000, { from: staker });
      await token.transfer(other, 100000, { from: staker });

      ds = await DelphiStake.new();

      await token.approve(ds.address, conf.initialStake, { from: staker });

      await ds.initDelphiStake(staker, conf.initialStake, token.address, conf.minFee, conf.data,
        conf.deadline, arbiter, { from: staker });

      // whitelist the claimant since most tests
      // use this format. Use 'other' for other situations
      await ds.whitelistClaimant(claimant, conf.deadline, { from: staker });
    });

    it('should not allow the arbiter to open a claim', async () => {
      await ds.whitelistClaimant(arbiter, conf.deadline, { from: staker });

      await token.approve(ds.address, feeAmount, { from: arbiter });

      try {
        await ds.openClaim(claimAmount, feeAmount, '', { from: arbiter });
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());

        const finalClaims = await ds.getNumClaims.call();
        assert.strictEqual(startingClaims.toString(10), finalClaims.toString(10),
          'claims counter incremented mysteriously');

        return;
      }

      assert(false, 'Expected claim by arbiter to fail');
    });

    it('should not allow the staker to open a claim', async () => {
      await ds.whitelistClaimant(staker, conf.deadline, { from: staker });

      await token.approve(ds.address, feeAmount, { from: staker });

      try {
        await ds.openClaim(claimAmount, feeAmount, '', { from: staker });
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());

        const finalClaims = await ds.getNumClaims.call();
        assert.strictEqual(startingClaims.toString(10), finalClaims.toString(10),
          'claims counter incremented mysteriously');

        return;
      }

      assert(false, 'expected claim by staker to fail');
    });

    it('should not allow a whitelisted individual to open a claim after their deadline', async () => {
      await ds.whitelistClaimant(other, '1', { from: staker });

      await token.approve(ds.address, feeAmount, { from: other });

      try {
        await ds.openClaim(claimAmount, feeAmount, '', { from: other });
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());

        const finalClaims = await ds.getNumClaims.call();
        assert.strictEqual(startingClaims.toString(10), finalClaims.toString(10),
          'claims counter incremented mysteriously');

        return;
      }

      assert(false, 'expected to not allow a whitelisted individual to open a claim after their deadline');
    });

    it('should not allow a non-whitelisted individual to open a claim', async () => {
      await token.approve(ds.address, feeAmount, { from: other });

      try {
        await ds.openClaim(claimAmount, feeAmount, '', { from: other });
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());

        const finalClaims = await ds.getNumClaims.call();
        assert.strictEqual(startingClaims.toString(10), finalClaims.toString(10),
          'claims counter incremented mysteriously');

        return;
      }

      assert(false, 'expected claim by non-whitelisted individual to fail');
    });

    it('should revert if _fee is smaller than the minimum', async () => {
      await token.approve(ds.address, parseInt(conf.minFee, 10) - 1, { from: claimant });

      try {
        await ds.openClaim(claimAmount, conf.minFee - 1, '', { from: claimant });
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());

        const finalClaims = await ds.getNumClaims.call();
        assert.strictEqual(startingClaims.toString(10), finalClaims.toString(10),
          'claims counter incremented mysteriously');

        return;
      }

      assert(false, 'expected claim for more than is available in stake to fail');
    });

    it('should revert if _amount + _fee is greater than the available stake', async () => {
      const amount = (parseInt(conf.minFee, 10) + parseInt(conf.initialStake, 10) + 1).toString(10);
      await token.approve(ds.address, amount, { from: claimant });

      try {
        await ds.openClaim(claimAmount, amount, '', { from: claimant });
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());

        const finalClaims = await ds.getNumClaims.call();
        assert.strictEqual(startingClaims.toString(10), finalClaims.toString(10),
          'claims counter incremented mysteriously');

        return;
      }

      assert(false, 'expected claim for more than is available in stake to fail');
    });

    it('should revert if the fee is not transferred with the transaction', async () => {
      try {
        await ds.openClaim(claimAmount, feeAmount, '', { from: claimant });
      } catch (err) {
        assert(utils.isEVMRevert(err), err.toString());

        const finalClaims = await ds.openClaims.call();
        assert.strictEqual(startingClaims.toString(10), finalClaims.toString(10),
          'claims counter incremented mysteriously');

        return;
      }

      assert(false, 'expected revert if the fee is not transferred with the transaction');
    });

    it('should increment the getNumClaims counter', async () => {
      await token.approve(ds.address, feeAmount, { from: claimant });

      await ds.openClaim(claimAmount, feeAmount, '', { from: claimant });

      const finalClaims = await ds.getNumClaims();
      assert.strictEqual(startingClaims.add(new BN('1', 10)).toString(10),
        finalClaims.toString(10),
        'claim counter not incremented as-expected');
    });

    it('should add a new claim to the claims array and properly initialize its properties',
      async () => {
        await token.approve(ds.address, feeAmount, { from: claimant });

        const claimId = await ds.getNumClaims();

        await ds.openClaim(claimAmount, feeAmount, 'newclaim', { from: claimant });

        const claim = await ds.claims.call(claimId);

        assert.strictEqual(claim[0], claimant, 'initialized claimant incorrectly');
        assert.strictEqual(claim[1].toString(10), claimAmount, 'initialized claim amount incorrectly');
        assert.strictEqual(claim[2].toString(10), feeAmount, 'initialized claim fee incorrectly');
        assert.strictEqual(claim[3].toString(10), '0', 'initialized claim surplus fee incorrectly');
        assert.strictEqual(claim[4], 'newclaim', 'initialized claim data incorrectly');
        assert.strictEqual(claim[5].toString(10), '0', 'initialized claim ruling incorrectly');
        assert.strictEqual(claim[6], false, 'initialized ruled bool incorrectly');
        assert.strictEqual(claim[7], false, 'initialized settlementFailed incorrectly');
      });

    it('should increment the openClaims.call counter', async () => {
      await token.approve(ds.address, feeAmount, { from: claimant });

      await ds.openClaim(claimAmount, feeAmount, '', { from: claimant });

      const finalClaims = await ds.openClaims();
      assert.strictEqual(startingClaims.add(new BN('1', 10)).toString(10),
        finalClaims.toString(10),
        'claim counter not incremented as-expected');
    });

    it('should decrement the stakers stake by amount + fee', async () => {
      await token.approve(ds.address, feeAmount, { from: claimant });

      const startingStake = await ds.claimableStake.call();

      await ds.openClaim(claimAmount, feeAmount, '', { from: claimant });

      const finalStake = await ds.claimableStake();
      assert.strictEqual(startingStake.sub(new BN(claimAmount, 10).add(feeAmount)).toString(10),
        finalStake.toString(10),
        'stake was not decremented as-expected when a new claim was opened');

      const newBalance = await token.balanceOf(ds.address);
      assert.strictEqual(startingStake.add(feeAmount).toString(10), newBalance.toString(10),
        'balance does not reflect the originally deposited funds and additional fee');
    });

    it('should emit a NewClaim event', async () => {
      await token.approve(ds.address, feeAmount, { from: claimant });

      await ds.openClaim(claimAmount, feeAmount, '', { from: claimant }).then((status) => {
        assert.strictEqual('ClaimOpened', status.logs[0].event, 'did not emit the NewClaim event');
      });
    });

    it('should append claims to the end of the claim array, without overwriting earlier claims', async () => {
      await token.approve(ds.address, feeAmount, { from: claimant });
      await ds.openClaim(claimAmount, feeAmount, 'claim1', { from: claimant });

      await token.approve(ds.address, feeAmount, { from: claimant });
      await ds.openClaim(claimAmount, feeAmount, 'claim2', { from: claimant });

      await token.approve(ds.address, feeAmount, { from: claimant });
      await ds.openClaim(claimAmount, feeAmount, 'claim3', { from: claimant });

      const claim1 = await ds.claims.call('0');

      assert.strictEqual(claim1[0], claimant, 'initialized claimant incorrectly');
      assert.strictEqual(claim1[1].toString(10), claimAmount, 'initialized claim amount incorrectly');
      assert.strictEqual(claim1[2].toString(10), feeAmount, 'initialized claim fee incorrectly');
      assert.strictEqual(claim1[3].toString(10), '0', 'initialized claim surplus fee incorrectly');
      assert.strictEqual(claim1[4], 'claim1', 'initialized claim data incorrectly');
      assert.strictEqual(claim1[5].toString(10), '0', 'initialized claim ruling incorrectly');
      assert.strictEqual(claim1[6], false, 'initialized ruled bool incorrectly');
      assert.strictEqual(claim1[7], false, 'initialized settlementFailed incorrectly');

      const claim2 = await ds.claims.call('1');

      assert.strictEqual(claim2[0], claimant, 'initialized claimant incorrectly');
      assert.strictEqual(claim2[1].toString(10), claimAmount, 'initialized claim amount incorrectly');
      assert.strictEqual(claim2[2].toString(10), feeAmount, 'initialized claim fee incorrectly');
      assert.strictEqual(claim2[3].toString(10), '0', 'initialized claim surplus fee incorrectly');
      assert.strictEqual(claim2[4], 'claim2', 'initialized claim data incorrectly');
      assert.strictEqual(claim2[5].toString(10), '0', 'initialized claim ruling incorrectly');
      assert.strictEqual(claim2[6], false, 'initialized ruled bool incorrectly');
      assert.strictEqual(claim2[7], false, 'initialized settlementFailed incorrectly');

      const claim3 = await ds.claims.call('2');

      assert.strictEqual(claim3[0], claimant, 'initialized claimant incorrectly');
      assert.strictEqual(claim3[1].toString(10), claimAmount, 'initialized claim amount incorrectly');
      assert.strictEqual(claim3[2].toString(10), feeAmount, 'initialized claim fee incorrectly');
      assert.strictEqual(claim3[3].toString(10), '0', 'initialized claim surplus fee incorrectly');
      assert.strictEqual(claim3[4], 'claim3', 'initialized claim data incorrectly');
      assert.strictEqual(claim3[5].toString(10), '0', 'initialized claim ruling incorrectly');
      assert.strictEqual(claim3[6], false, 'initialized ruled bool incorrectly');
      assert.strictEqual(claim3[7], false, 'initialized settlementFailed incorrectly');
    });
  });
});
